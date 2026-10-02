#!/usr/bin/env python3
"""fornectd — Fornect agent na uređaju (Orange Pi / R76S).

Veza između fizičkog uređaja i panela (admin.lukmandavran.cc):

  1. Registracija: pri prvom pokretanju uređaj se registruje na backend,
     dobije svoj id, token i 6-cifreni pairing kod. Token se čuva u
     /etc/fornect/agent.json (0600) i NIKAD se ne ispisuje.
  2. Uparivanje: korisnik unese pairing kod u aplikaciju. Dok uređaj nije
     uparen, agent kod osvježava kad istekne (15 min) i ispisuje ga u log.
  3. Heartbeat (svakih 60 s): verzije komponenti + zdravstveni podaci
     (DNS upiti i blokirani u zadnjih 24h, RAM, uptime, blokiranje on/off).
  4. Konfiguracija (svakih 60 s): povlači GET /config; kad stigne nova
     verzija, sačuva je u /etc/fornect/config.json i potvrdi (ack).

  5. Uređaji na mreži (v0.2): novi MAC -> device.new event (red "Novi
     uređaji" u panelu), svi viđeni -> network-presence (online/offline).
     Izvori: ARP tabela + Pi-hole mrežna tabela (klijenti koji su pitali
     DNS u zadnjih 10 min).

  6. Portal i pristanak (v0.3): portal na :8080, pristanak -> oblak,
     provjera certifikata preko Squid loga -> consent.verified, a
     consented_macs iz konfiguracije -> Squid bump lista.

  7. Captive (v0.4): port 80 odgovara na provjere interneta (Android,
     iPhone, Windows...). Neodlučen uređaj -> preusmjerenje na portal, pa
     mu se prozor sam otvori odmah po spajanju na WiFi.

  8. Imena (v0.5): sluša DHCP zahtjeve na mreži (ime i tip sistema koje
     uređaj sam pošalje pri spajanju) -> pravo ime u panelu umjesto MAC-a.

Liste za filtriranje iz konfiguracije se primjenjuju na Pi-hole (v0.6):
upišu se u gravity.db kao Fornect adliste i pozove se `pihole -g`.

Samo standardna Python biblioteka (Python >= 3.9), bez pip paketa.

Upotreba:
  fornectd.py            pokreni agenta (za systemd)
  fornectd.py --status   ispiši stanje (id, uparen, pairing kod) bez tokena
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

VERSION = "0.7.0"

API_BASE = os.environ.get("FORNECT_API", "https://admin.lukmandavran.cc/api/v1").rstrip("/")
STATE_DIR = os.environ.get("FORNECT_STATE_DIR", "/etc/fornect")
STATE_FILE = os.path.join(STATE_DIR, "agent.json")
CONFIG_FILE = os.path.join(STATE_DIR, "config.json")
DEVICE_NAME = os.environ.get("FORNECT_DEVICE_NAME", socket.gethostname())
DEVICE_KIND = os.environ.get("FORNECT_DEVICE_KIND", "home")
# Profil uređaja. "v1" = DNS filtriranje, scam, roditeljska kontrola
# (proizvod koji isporučujemo). "v2" = sve to + MITM: captive portal,
# pristanak i CA certifikat. V1 uređaj NE diže portal ni captive, jer
# bi kupcu bez razloga otvarao ekran za certifikat.
PROFILE = os.environ.get("FORNECT_PROFILE", "v1").lower()
PIHOLE_DB = os.environ.get("FORNECT_PIHOLE_DB", "/etc/pihole/pihole-FTL.db")
GRAVITY_DB = os.environ.get("FORNECT_GRAVITY_DB", "/etc/pihole/gravity.db")

HEARTBEAT_INTERVAL = int(os.environ.get("FORNECT_HEARTBEAT_SECONDS", "60"))
STATS_INTERVAL = 300  # DNS brojke iz baze se računaju rjeđe (skupo na 512 MB)
HTTP_TIMEOUT = 20
CMD_TIMEOUT = 20

# Pi-hole v6 statusi upita koji znače "blokirano"
# (gravity, regex, denylist, upstream blokade, CNAME varijante, special domain).
BLOCKED_STATUSES = "1,4,5,6,7,8,9,10,11,15,16,18"

_running = True


def log(msg: str) -> None:
    # systemd/journald dodaje vrijeme; flush da se vidi odmah
    print(msg, flush=True)


def _stop(signum, _frame) -> None:  # noqa: ANN001
    global _running
    _running = False
    log(f"Primljen signal {signum}, gasim se.")


# ---------------------------------------------------------------- stanje

def load_state() -> dict:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_state(state: dict) -> None:
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)


def save_config(cfg: dict) -> None:
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    tmp = CONFIG_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, CONFIG_FILE)


# ------------------------------------------------------------------ HTTP

class ApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:200]}")
        self.status = status
        self.body = body


def api(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API_BASE + path, data=data, method=method)
    req.add_header("User-Agent", f"fornectd/{VERSION}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, e.read().decode("utf-8", "replace")) from None


# ------------------------------------------------------- lokalni podaci

def run(cmd: list[str]) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=CMD_TIMEOUT)
        return out.stdout.strip() if out.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def collect_versions() -> dict:
    versions = {"fornectd": VERSION, "python": sys.version.split()[0]}
    ftl = run(["pihole-FTL", "--version"])
    if ftl:
        versions["pihole_ftl"] = ftl.splitlines()[0].strip()
    squid = run(["squid", "-v"])
    if squid:
        # "Squid Cache: Version 5.7"
        first = squid.splitlines()[0]
        versions["squid"] = first.split("Version")[-1].strip() if "Version" in first else first
    try:
        with open("/etc/os-release", encoding="utf-8") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    versions["os"] = line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return versions


def dns_stats_24h() -> dict | None:
    """Upiti i blokirani u zadnjih 24h iz Pi-hole baze. None ako nije dostupno."""
    if not os.path.exists(PIHOLE_DB):
        return None
    sql = (
        "SELECT count(*), coalesce(sum(status IN (" + BLOCKED_STATUSES + ")),0) "
        "FROM queries WHERE timestamp > strftime('%s','now') - 86400;"
    )
    out = run(["pihole-FTL", "sqlite3", "-readonly", PIHOLE_DB, sql]) or run(
        ["pihole-FTL", "sqlite3", PIHOLE_DB, sql]
    )
    if not out:
        return None
    try:
        total, blocked = (int(x) for x in out.splitlines()[-1].split("|"))
    except ValueError:
        return None
    return {"queries_24h": total, "blocked_24h": blocked}


def system_stats() -> dict:
    stats: dict = {}
    try:
        with open("/proc/uptime", encoding="utf-8") as f:
            stats["uptime_s"] = int(float(f.read().split()[0]))
    except OSError:
        pass
    try:
        mem = {}
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                k, v = line.split(":", 1)
                mem[k] = int(v.split()[0])
        stats["mem_total_mb"] = mem["MemTotal"] // 1024
        stats["mem_available_mb"] = mem["MemAvailable"] // 1024
    except (OSError, KeyError, ValueError):
        pass
    try:
        stats["load_1m"] = round(os.getloadavg()[0], 2)
    except OSError:
        pass
    active = run(["pihole-FTL", "--config", "dns.blocking.active"])
    if active in ("true", "false"):
        stats["dns_blocking_active"] = active == "true"
    for svc in ("pihole-FTL", "squid", "tailscaled"):
        st = run(["systemctl", "is-active", svc])
        stats.setdefault("services", {})[svc] = st or "unknown"
    return stats


# ------------------------------------------------- uređaji na mreži

PRESENT_STATES = {"REACHABLE", "STALE", "DELAY", "PROBE", "PERMANENT"}
PIHOLE_RECENT_SECONDS = 600


def _norm_mac(mac: str | None) -> str | None:
    if not mac:
        return None
    mac = mac.strip().lower().replace("-", ":")
    parts = mac.split(":")
    if len(parts) != 6 or any(len(p) != 2 for p in parts):
        return None
    if mac in ("00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"):
        return None
    return mac


def _gateway_ip() -> str | None:
    out = run(["ip", "-4", "route", "show", "default"])
    if out:
        parts = out.split()
        if "via" in parts:
            return parts[parts.index("via") + 1]
    return None


_last_sweep = 0.0
SWEEP_INTERVAL = 300


def arp_sweep() -> None:
    """Natjera kernel da pita (ARP) svaku adresu u /24 mreži uređaja.

    Bez ovoga agent vidi samo uređaje koji su sami pričali s njim (DNS).
    Uređaj sa statičkom IP adresom i vlastitim DNS-om bi ostao nevidljiv,
    iako ga ruter vidi. Na ARP odgovara svaki uređaj, i onaj s firewallom.
    Šalje se po jedan prazan UDP paket na port 9 (discard) — samo da bi
    kernel poslao ARP upit; odgovor na UDP nije bitan.
    """
    global _last_sweep
    if time.monotonic() - _last_sweep < SWEEP_INTERVAL and _last_sweep:
        return
    _last_sweep = time.monotonic()
    out = run(["ip", "-4", "-o", "addr", "show", "scope", "global"]) or ""
    for line in out.splitlines():
        parts = line.split()
        if "inet" not in parts:
            continue
        cidr = parts[parts.index("inet") + 1]
        ip, _, prefix = cidr.partition("/")
        if prefix != "24":
            continue  # samo obične kućne mreže; veće se ne skeniraju
        base = ip.rsplit(".", 1)[0]
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setblocking(False)
        for host in range(1, 255):
            target = f"{base}.{host}"
            if target == ip:
                continue
            try:
                sock.sendto(b"", (target, 9))
            except OSError:
                pass
        sock.close()
        time.sleep(3)  # da ARP odgovori stignu prije čitanja tabele
        break


def discover_lan() -> dict[str, dict]:
    """MAC -> {ip, name}. Izvori: ARP tabela uređaja + Pi-hole mrežna tabela.

    Svi klijenti koriste Pi-hole kao DNS, pa ih Pi-hole vidi i pamti MAC
    (iz ARP-a). Ruter se izostavlja — on nije klijentski uređaj.
    """
    arp_sweep()
    gateway = _gateway_ip()
    found: dict[str, dict] = {}

    neigh = run(["ip", "-4", "neigh", "show"]) or ""
    for line in neigh.splitlines():
        parts = line.split()
        if "lladdr" not in parts or not parts:
            continue
        state = parts[-1]
        if state not in PRESENT_STATES:
            continue
        ip = parts[0]
        if ip == gateway:
            continue
        mac = _norm_mac(parts[parts.index("lladdr") + 1])
        if mac:
            found.setdefault(mac, {"ip": ip, "name": None})

    if os.path.exists(PIHOLE_DB):
        sql = (
            "SELECT n.hwaddr, coalesce(n.macVendor,''), "
            "coalesce((SELECT na.name FROM network_addresses na WHERE na.network_id=n.id "
            "AND na.name IS NOT NULL ORDER BY na.lastSeen DESC LIMIT 1),''), "
            "coalesce((SELECT na.ip FROM network_addresses na WHERE na.network_id=n.id "
            "ORDER BY na.lastSeen DESC LIMIT 1),'') "
            f"FROM network n WHERE n.lastQuery > strftime('%s','now') - {PIHOLE_RECENT_SECONDS};"
        )
        out = run(["pihole-FTL", "sqlite3", "-readonly", PIHOLE_DB, sql]) or ""
        for line in out.splitlines():
            cols = line.split("|")
            if len(cols) < 4:
                continue
            mac = _norm_mac(cols[0])
            if not mac or cols[3] == gateway:
                continue
            vendor, host, ip = cols[1].strip(), cols[2].strip(), cols[3].strip()
            entry = found.setdefault(mac, {"ip": ip or None, "name": None})
            if host:
                entry["name"] = host.split(".")[0]
            elif vendor and not entry.get("name"):
                entry["name"] = f"{vendor} uređaj"
    return found


# ------------------------------------------- imena uređaja (v0.5)
#
# Ruter je DHCP server, pa samo on zna imena uređaja. Ali uređaj kad se
# spoji pošalje DHCP zahtjev kao broadcast na cijelu mrežu, s imenom
# (opcija 12 / 81) i tipom sistema (opcija 60). Agent sluša port 67 i
# pamti MAC -> ime. Ništa ne odgovara — ruter i dalje dijeli adrese.

NAMES_FILE = os.path.join(STATE_DIR, "names.json")
_names_lock = threading.Lock()


def names_load() -> dict:
    try:
        with open(NAMES_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def _parse_dhcp(pkt: bytes) -> tuple[str, dict] | None:
    if len(pkt) < 240 or pkt[0] != 1 or pkt[236:240] != b"\x63\x82\x53\x63":
        return None
    mac = _norm_mac(":".join(f"{b:02x}" for b in pkt[28:34]))
    if not mac:
        return None
    info: dict = {}
    i = 240
    while i < len(pkt):
        code = pkt[i]
        if code == 255:
            break
        if code == 0:
            i += 1
            continue
        if i + 1 >= len(pkt):
            break
        ln = pkt[i + 1]
        val = pkt[i + 2 : i + 2 + ln]
        i += 2 + ln
        if code == 12:
            info["hostname"] = val.decode("utf-8", "replace").strip("\x00 ").strip()
        elif code == 60:
            info["vendor_class"] = val.decode("utf-8", "replace").strip("\x00 ").strip()
        elif code == 81 and len(val) > 3 and not info.get("fqdn"):
            info["fqdn"] = val[3:].decode("utf-8", "replace").strip("\x00 .").split(".")[0]
    return mac, info


def friendly_name(info: dict) -> tuple[str | None, str]:
    """(ime, tip) iz DHCP podataka. Tip je iz skupa koji backend prima."""
    host = (info.get("hostname") or info.get("fqdn") or "").strip()
    vc = (info.get("vendor_class") or "").lower()
    dtype = "unknown"
    if vc.startswith("android") or "iphone" in host.lower() or "ipad" in host.lower():
        dtype = "phone"
    if host and host.lower() not in ("localhost", "android", "unknown"):
        # "Lukmans-iPhone" / "Galaxy-S23" / "DESKTOP-4K2..." -> čitljivije
        return host.replace("-", " ").replace("_", " ")[:60], dtype
    if vc.startswith("android"):
        return "Android telefon", "phone"
    if vc.startswith("msft"):
        return "Windows računar", dtype
    if vc.startswith("dhcpcd") or vc.startswith("udhcp"):
        return "Linux uređaj", dtype
    return None, dtype


def dhcp_listener() -> None:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.bind(("0.0.0.0", 67))
    except OSError as e:
        log(f"Imena uređaja: ne mogu slušati DHCP (port 67): {e}")
        return
    log("Imena uređaja: slušam DHCP zahtjeve na mreži.")
    while _running:
        try:
            pkt, _addr = sock.recvfrom(2048)
        except OSError:
            time.sleep(1)
            continue
        parsed = _parse_dhcp(pkt)
        if not parsed:
            continue
        mac, info = parsed
        name, dtype = friendly_name(info)
        if not name:
            continue
        with _names_lock:
            names = names_load()
            if names.get(mac, {}).get("name") == name:
                continue
            names[mac] = {"name": name, "type": dtype, "seen_at": now_iso(), **info}
            os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
            tmp = NAMES_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(names, f, indent=2)
            os.replace(tmp, NAMES_FILE)
        log(f"Ime uređaja {mac}: {name}")


def report_lan(state: dict) -> dict:
    """Novi MAC -> device.new (red "Novi uređaji"); novo ime -> device.new s imenom
    (backend ga upiše samo ako je ime još MAC); svi viđeni -> network-presence."""
    import zlib

    lan = discover_lan()
    with _names_lock:
        names = names_load()
    known = set(state.get("known_macs") or [])
    reported = dict(state.get("reported_names") or {})
    events = []
    for mac, entry in lan.items():
        n = names.get(mac) or {}
        name = n.get("name") or entry.get("name")
        dtype = n.get("type") or "unknown"
        if mac not in known:
            events.append({"event_id": f"new-{mac}", "type": "device.new", "mac": mac,
                           "at": now_iso(), "name": name, "device_type": dtype})
        elif name and reported.get(mac) != name:
            tag = f"{zlib.crc32(name.encode()):08x}"
            events.append({"event_id": f"name-{mac}-{tag}", "type": "device.new", "mac": mac,
                           "at": now_iso(), "name": name, "device_type": dtype})
    if events:
        res = api("POST", f"/devices/{state['device_id']}/events", token=state["token"],
                  body={"events": events[:200]})
        by_id = {e["event_id"]: e for e in events}
        applied_new = 0
        for r in res.get("results", []):
            if r.get("status") not in ("applied", "duplicate"):
                continue
            ev = by_id.get(r.get("event_id"))
            if not ev:
                continue
            known.add(ev["mac"])
            if ev.get("name"):
                reported[ev["mac"]] = ev["name"]
            if ev["event_id"].startswith("new-") and r.get("status") == "applied":
                applied_new += 1
        state["known_macs"] = sorted(known)
        state["reported_names"] = reported
        save_state(state)
        if applied_new:
            log(f"Javljeno {applied_new} novih uređaja na mreži (red 'Novi uređaji' u panelu).")
    res = api(
        "POST",
        f"/devices/{state['device_id']}/network-presence",
        token=state["token"],
        body={"macs": sorted(lan)},
    )
    if res.get("changed"):
        log(f"Prisutnost: {len(lan)} uređaja na mreži, {res['changed']} promjena statusa.")
    return state


# ------------------------------------------ portal i pristanak (v0.3)
#
# Tok za jedan uređaj (MAC):
#   unknown --portal: pristanak--> verifying --TLS handshake kroz Squid--> consented
#                 \--portal: osnovna--> guest
#
# verifying: MAC je privremeno u Squid bump listi, da bi se vidjelo da li
# klijent vjeruje našem CA certifikatu. Dokaz je dekriptovan zahtjev ka
# CHECK_HOST u Squid access logu (bez povjerenja u CA TLS handshake ne
# uspije, pa dekriptovanog zahtjeva nema). Tek tada ide consent.verified
# u oblak, oblak MAC upiše u consented_macs, a agent ga dobije nazad
# kroz konfiguraciju.
#
# Bump lista = consented_macs iz oblaka ∪ lokalni MAC-ovi u verifying.
# Sve ostalo Squid propušta bez presretanja (splice).

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTAL_DIR = os.environ.get("FORNECT_PORTAL_DIR", "/opt/fornect/portal")
PORTAL_PORT = int(os.environ.get("FORNECT_PORTAL_PORT", "8080"))
PORTAL_STATE_FILE = os.path.join(STATE_DIR, "portal.json")
CA_CERT = os.environ.get("FORNECT_CA_CERT", "/etc/squid/certs/fornect-ca.crt")
BUMP_FILE = os.environ.get("FORNECT_BUMP_FILE", "/etc/squid/fornect/bump-macs.txt")
SQUID_LOG = os.environ.get("FORNECT_SQUID_LOG", "/var/log/squid/access.log")
CHECK_HOST = os.environ.get("FORNECT_CHECK_HOST", "check.fornect.local")
POLICY_VERSION = "1.0"
PORTAL_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

_portal_lock = threading.RLock()


def portal_load() -> dict:
    try:
        with open(PORTAL_STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {"devices": {}}


def portal_save(pstate: dict) -> None:
    os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
    tmp = PORTAL_STATE_FILE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(pstate, f, indent=2)
    os.replace(tmp, PORTAL_STATE_FILE)


def ip_to_mac(ip: str) -> str | None:
    try:
        with open("/proc/net/arp", encoding="utf-8") as f:
            next(f)
            for line in f:
                cols = line.split()
                if len(cols) >= 4 and cols[0] == ip:
                    return _norm_mac(cols[3])
    except OSError:
        pass
    out = run(["ip", "-4", "neigh", "show", ip]) or ""
    parts = out.split()
    if "lladdr" in parts:
        return _norm_mac(parts[parts.index("lladdr") + 1])
    return None


def ca_fingerprint() -> str | None:
    try:
        import hashlib
        import ssl

        with open(CA_CERT, encoding="utf-8") as f:
            der = ssl.PEM_cert_to_DER_cert(f.read())
        digest = hashlib.sha256(der).hexdigest().upper()
        return ":".join(digest[i : i + 2] for i in range(0, len(digest), 2))
    except (OSError, ValueError):
        return None


def consented_from_config() -> set[str]:
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f).get("config") or {}
    except (OSError, ValueError):
        return set()
    return {m for m in (_norm_mac(x) for x in cfg.get("consented_macs") or []) if m}


def send_events(events: list[dict]) -> list[dict]:
    state = load_state()
    if not state.get("device_id"):
        raise ApiError(409, "uređaj nije registrovan")
    res = api("POST", f"/devices/{state['device_id']}/events", token=state["token"], body={"events": events})
    return res.get("results", [])


def apply_bump_list() -> None:
    """Upiše bump listu za Squid ako se promijenila i kaže Squidu da je pročita."""
    consented = consented_from_config()
    with _portal_lock:
        pstate = portal_load()
        for mac, dev in pstate["devices"].items():
            if mac in consented and dev.get("state") != "consented":
                dev["state"] = "consented"
                dev["accepted_policy_version"] = POLICY_VERSION
        portal_save(pstate)
        verifying = {m for m, d in pstate["devices"].items() if d.get("state") == "verifying"}
    wanted = sorted(consented | verifying)
    body = "".join(m + "\n" for m in wanted)
    try:
        with open(BUMP_FILE, encoding="utf-8") as f:
            if f.read() == body:
                return
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(BUMP_FILE), exist_ok=True)
    with open(BUMP_FILE, "w", encoding="utf-8") as f:
        f.write(body)
    ok = run(["squid", "-k", "reconfigure"]) is not None
    log(
        f"Squid bump lista: {len(consented)} s pristankom + {len(verifying)} u provjeri"
        + ("" if ok else " (squid -k reconfigure NIJE uspio)")
    )


# ------------------------------------------------- filter liste (Pi-hole)
#
# Panel šalje `filter_lists.urls` (adliste koje uređaj treba vrtiti) i
# `filter_lists.set_id` (koji je to set, za historiju/rollback). Mi te
# adrese upišemo u Pi-hole gravity.db i pozovemo `pihole -g` da izgradi
# gravitaciju. Diramo SAMO redove koje je Fornect upisao (comment
# 'fornect-managed'); adliste koje bi vlasnik ručno dodao ostaju.
#
# Prazan `urls` znači "panel nema šta reći o listama" — tada se NE dira
# ništa, uređaj ostaje na postojećem setu. Prazan niz NIJE "ugasi
# filtriranje" (to bi bila zaštita ugašena greškom u panelu).
#
# `pihole -g` povlači liste s interneta i zna trajati, pa ide u zasebnoj
# niti; glavna petlja (heartbeat, prisutnost) se ne zaustavlja.

FORNECT_ADLIST_TAG = "fornect-managed"
# `pihole -g` skida sve adliste i gradi bazu; na Orange Pi Zero sa 6+
# lista to traje i nekoliko minuta. Opšti CMD_TIMEOUT (20 s) ga je
# prekidao usred posla (v0.6.0), pa rebuild ima svoj rok.
GRAVITY_TIMEOUT = 900
GRAVITY_RETRY_SECONDS = 900
_gravity_lock = threading.Lock()
_gravity_state: dict = {"running": False, "failed_at": None, "set_id": None, "count": 0}

# Dozvoljen oblik adrese adliste. URL u SQL ide kroz ovu provjeru, pa
# nema potrebe bježati navodnike — sve što nije čist http(s) URL se
# odbaci prije upisa.
_URL_RE = re.compile(r"^https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$")


def _gravity_sql(sql: str) -> bool:
    """Izvrši SQL nad gravity.db. True ako je prošlo."""
    return run(["pihole-FTL", "sqlite3", GRAVITY_DB, sql]) is not None


def _rebuild_gravity(set_id: str | None, count: int) -> None:
    """U zasebnoj niti: `pihole -g` izgradi gravitaciju iz adlista.

    Ako ne uspije, stara gravitacija ostaje aktivna (Pi-hole gradi u
    privremenu tabelu), a glavna petlja pokuša ponovo nakon
    GRAVITY_RETRY_SECONDS.
    """
    detail = ""
    with _gravity_lock:
        try:
            proc = subprocess.run(
                ["pihole", "-g"], capture_output=True, text=True, timeout=GRAVITY_TIMEOUT
            )
            ok = proc.returncode == 0
            if not ok:
                tail = ((proc.stderr or "") + (proc.stdout or "")).strip().splitlines()
                detail = f" (izlaz {proc.returncode}: {tail[-1] if tail else 'bez poruke'})"
        except subprocess.TimeoutExpired:
            ok = False
            detail = f" (prekinuto nakon {GRAVITY_TIMEOUT} s)"
        except OSError as e:
            ok = False
            detail = f" ({e})"
        _gravity_state.update(
            running=False,
            failed_at=None if ok else time.monotonic(),
            set_id=set_id,
            count=count,
        )
    log(
        f"Filter liste primijenjene: {count} adlista (set {set_id or '-'}), "
        + (
            "gravitacija izgrađena."
            if ok
            else f"ali `pihole -g` NIJE uspio{detail}. Ponovo za {GRAVITY_RETRY_SECONDS // 60} min."
        )
    )


def start_gravity_rebuild(set_id: str | None, count: int) -> None:
    """Pokrene rebuild u pozadini, osim ako jedan već radi."""
    if _gravity_state["running"]:
        return
    _gravity_state["running"] = True
    threading.Thread(
        target=_rebuild_gravity,
        args=(set_id, count),
        daemon=True,
        name="gravity",
    ).start()


def retry_gravity_if_needed() -> None:
    """Zove ga glavna petlja: ponovi neuspjeli rebuild nakon pauze."""
    failed_at = _gravity_state["failed_at"]
    if (
        failed_at is not None
        and not _gravity_state["running"]
        and time.monotonic() - failed_at > GRAVITY_RETRY_SECONDS
    ):
        log("Filter liste: ponovni pokušaj izgradnje gravitacije.")
        start_gravity_rebuild(_gravity_state["set_id"], _gravity_state["count"])


def apply_filter_lists(cfg: dict, state: dict) -> None:
    """Upiše adliste iz konfiguracije u gravity.db i pokrene rebuild.

    Radi samo kad se set stvarno promijenio (potpis u state-u), i samo
    nad redovima koje je Fornect upisao.
    """
    flt = cfg.get("filter_lists") or {}
    raw_urls = flt.get("urls") or []
    set_id = flt.get("set_id")

    # Prazno => panel ne govori o listama => ne diramo ništa.
    if not raw_urls:
        return

    urls = sorted({u.strip() for u in raw_urls if isinstance(u, str) and _URL_RE.match(u.strip())})
    dropped = len(raw_urls) - len(urls)
    if dropped:
        log(f"Filter liste: {dropped} neispravnih URL-ova preskočeno.")
    if not urls:
        log("Filter liste: nijedan URL nije ispravan, ne mijenjam gravity.db.")
        return

    sig = f"{set_id}|" + "\n".join(urls)
    if state.get("applied_lists_sig") == sig:
        return

    if not os.path.exists(GRAVITY_DB):
        log(f"Filter liste: {GRAVITY_DB} ne postoji, preskačem (dev okruženje?).")
        return

    tag = FORNECT_ADLIST_TAG
    values = ",".join(f"('{u}',1,'{tag}')" for u in urls)
    keep = ",".join(f"'{u}'" for u in urls)
    stmts = [
        # Ukloni Fornect adliste kojih više nema u setu.
        f"DELETE FROM adlist WHERE comment='{tag}' AND address NOT IN ({keep});",
        # Dodaj nove; postojeće ostaju (address je UNIQUE).
        f"INSERT OR IGNORE INTO adlist (address,enabled,comment) VALUES {values};",
        # Osiguraj da su sve Fornect adliste uključene.
        f"UPDATE adlist SET enabled=1 WHERE comment='{tag}' AND address IN ({keep});",
    ]
    for sql in stmts:
        if not _gravity_sql(sql):
            log("Filter liste: upis u gravity.db NIJE uspio, rebuild se ne pokreće.")
            return

    state["applied_lists_sig"] = sig
    save_state(state)
    start_gravity_rebuild(set_id, len(urls))


# ------------------------------------------- zaštita od prevara (V1)
#
# Pi-hole blokira domene sa svih lista, ali roditelju treba javiti samo
# ono što je stvarno opasno: blokiranu reklamu ne, lažnu stranicu banke
# da. Zato agent svakih ~60 s pročita NOVE blokirane upite iz Pi-hole
# loga i za svaku domenu provjeri da li je u gravitaciji pogođena
# listom prevara/phishinga. Samo takve idu u panel kao threat.blocked.
#
# Koja je lista "scam" čita se iz adrese adliste (phishing, scam,
# threat-intel...). Reklamne liste (HaGeZi pro, popupads) ne prolaze.
#
# Jedna lažna stranica napravi desetine upita: šalje se najviše jedan
# event po (uređaj, domena, dan); event_id to nosi u sebi, pa ga i
# backend odbije kao duplikat ako ipak stigne dvaput.

SCAM_LIST_MARKERS = (
    "phishing", "scam", "fraud", "threat", "/tif", "tif.", "urlhaus",
    "openphish", "malware", "badware", "spam404", "fake",
)
THREAT_SCAN_MAX_ROWS = 2000
THREAT_MAX_EVENTS = 20
# Ime domene iz DNS upita ide u SQL i u tekst za roditelja, pa prolazi
# samo ono što je stvarno ime domene (bez navodnika, razmaka...).
_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$")
_threat_sent: set[str] = set()
_threat_sent_day = ""


def _sqlite_ro(db: str, sql: str) -> str | None:
    return run(["pihole-FTL", "sqlite3", "-readonly", db, sql]) or run(
        ["pihole-FTL", "sqlite3", db, sql]
    )


def scam_adlist_ids() -> list[int]:
    """ID-jevi uključenih adlista koje su liste prevara/phishinga."""
    out = _sqlite_ro(GRAVITY_DB, "SELECT id, lower(address) FROM adlist WHERE enabled=1;") or ""
    ids = []
    for line in out.splitlines():
        try:
            lid, addr = line.split("|", 1)
        except ValueError:
            continue
        if any(m in addr for m in SCAM_LIST_MARKERS):
            try:
                ids.append(int(lid))
            except ValueError:
                pass
    return ids


def _gravity_candidates(domain: str) -> list[str]:
    """Kako domena može stajati u gravitaciji: tačno ime, ili ABP
    pravilo za nju ili neku od nadređenih domena (||primjer.com^)."""
    parts = domain.split(".")
    cands = [domain]
    for i in range(len(parts) - 1):
        cands.append("||" + ".".join(parts[i:]) + "^")
    return cands


def scam_domains(domains: set[str], list_ids: list[int]) -> set[str]:
    """Od datih domena vrati one koje je blokirala neka scam lista."""
    if not domains or not list_ids:
        return set()
    cand_to_domain: dict[str, set[str]] = {}
    for d in domains:
        for c in _gravity_candidates(d):
            cand_to_domain.setdefault(c, set()).add(d)
    vals = ",".join(f"'{c}'" for c in cand_to_domain)
    ids = ",".join(str(i) for i in list_ids)
    out = _sqlite_ro(
        GRAVITY_DB,
        f"SELECT DISTINCT domain FROM gravity WHERE adlist_id IN ({ids}) AND domain IN ({vals});",
    ) or ""
    hit: set[str] = set()
    for line in out.splitlines():
        hit |= cand_to_domain.get(line.strip(), set())
    return hit


def scan_threats(state: dict) -> dict:
    """Pročita nove blokirane upite i pošalje threat.blocked za prevare."""
    global _threat_sent_day
    if not os.path.exists(PIHOLE_DB) or not os.path.exists(GRAVITY_DB):
        return state

    last = state.get("threat_last_query_id")
    if last is None:
        # Prvo pokretanje: ne šaljemo historiju, krećemo od sada.
        top = _sqlite_ro(PIHOLE_DB, "SELECT coalesce(max(id),0) FROM queries;")
        state["threat_last_query_id"] = int(top) if top and top.isdigit() else 0
        save_state(state)
        return state

    out = _sqlite_ro(
        PIHOLE_DB,
        "SELECT id, timestamp, lower(domain), client FROM queries "
        f"WHERE id > {int(last)} AND status IN ({BLOCKED_STATUSES}) "
        f"ORDER BY id LIMIT {THREAT_SCAN_MAX_ROWS};",
    )
    if out is None:
        return state

    rows = []
    max_id = int(last)
    for line in out.splitlines():
        cols = line.split("|")
        if len(cols) < 4:
            continue
        try:
            qid, ts = int(cols[0]), int(float(cols[1]))
        except ValueError:
            continue
        max_id = max(max_id, qid)
        domain = cols[2].strip().rstrip(".")
        if _DOMAIN_RE.match(domain):
            rows.append((ts, domain, cols[3].strip()))

    # Kursor ide naprijed i kad nema prevara, da se isti redovi ne
    # čitaju u krug.
    if max_id != int(last):
        state["threat_last_query_id"] = max_id
        save_state(state)

    if not rows:
        return state

    hits = scam_domains({d for _, d, _ in rows}, scam_adlist_ids())
    if not hits:
        return state

    today = dt.date.today().isoformat()
    if today != _threat_sent_day:
        _threat_sent.clear()
        _threat_sent_day = today

    events = []
    for ts, domain, ip in rows:
        if domain not in hits:
            continue
        mac = ip_to_mac(ip)
        if not mac:
            continue  # bez MAC-a ne znamo čiji je uređaj
        event_id = f"threat:{mac}:{domain}:{today}"
        if event_id in _threat_sent:
            continue
        _threat_sent.add(event_id)
        events.append({
            "event_id": event_id,
            "type": "threat.blocked",
            "mac": mac,
            "domain": domain,
            "at": dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat(timespec="seconds"),
        })
        if len(events) >= THREAT_MAX_EVENTS:
            break

    if events:
        try:
            send_events(events)
            log(f"Prevare: {len(events)} zaustavljenih domena javljeno panelu "
                f"({', '.join(e['domain'] for e in events[:3])}{'…' if len(events) > 3 else ''}).")
        except ApiError as e:
            if e.status != 409:
                # Vrati ih u red za sljedeći krug.
                for e2 in events:
                    _threat_sent.discard(e2["event_id"])
                raise
    return state


def portal_classify(mac: str, body: dict) -> tuple[int, dict]:
    target = body.get("state")
    with _portal_lock:
        pstate = portal_load()
        dev = pstate["devices"].setdefault(mac, {"state": "unknown"})
        current = dev.get("state", "unknown")

    if target == "guest":
        send_events([
            {"event_id": f"new-{mac}", "type": "device.new", "mac": mac, "at": now_iso()},
            {"event_id": f"guest-{mac}-{int(time.time())}", "type": "device.classified",
             "mac": mac, "state": "guest", "method": "portal", "at": now_iso()},
        ])
        with _portal_lock:
            pstate = portal_load()
            pstate["devices"].setdefault(mac, {})["state"] = "guest"
            portal_save(pstate)
        apply_bump_list()
        return 200, {"ok": True, "state": "guest"}

    if target != "consented":
        return 400, {"error": "state mora biti guest ili consented."}

    if current in ("verifying", "consented"):
        # Potvrda "instalirao sam" (method: manual) ne zaobilazi provjeru:
        # uređaj ostaje u verifying dok ne vidi handshake.
        return 200, {"ok": True, "state": current}

    consent = body.get("consent") or {}
    name = (consent.get("guardian_name") or "").strip()
    relation = (consent.get("guardian_relation") or "").strip()
    if not name or not relation:
        return 400, {"error": "guardian_name i guardian_relation su obavezni."}

    results = send_events([
        {"event_id": f"new-{mac}", "type": "device.new", "mac": mac, "at": now_iso()},
        {
            "event_id": f"consent-{mac}-{int(time.time())}",
            "type": "device.classified",
            "mac": mac,
            "state": "consented",
            "method": "portal",
            "at": now_iso(),
            "consent": {
                "guardian_name": name,
                "guardian_relation": relation,
                "subject_is_minor": bool(consent.get("subject_is_minor")),
                "ca_fingerprint": ca_fingerprint(),
            },
        },
    ])
    rejected = [r for r in results if r.get("status") == "rejected"]
    if rejected:
        return 409, {"error": rejected[-1].get("reason") or "Oblak je odbio pristanak."}

    with _portal_lock:
        pstate = portal_load()
        dev = pstate["devices"].setdefault(mac, {})
        dev.update({"state": "verifying", "accepted_policy_version": POLICY_VERSION,
                    "consented_at": now_iso()})
        portal_save(pstate)
    log(f"Pristanak s portala za {mac} — čeka potvrdu certifikata.")
    apply_bump_list()
    return 200, {"ok": True, "state": "verifying"}


def portal_revoke(mac: str) -> tuple[int, dict]:
    results = send_events([
        {"event_id": f"revoke-{mac}-{int(time.time())}", "type": "consent.revoked",
         "mac": mac, "reason": "Opozvano na portalu.", "at": now_iso()},
    ])
    with _portal_lock:
        pstate = portal_load()
        pstate["devices"].setdefault(mac, {})["state"] = "guest"
        pstate["devices"][mac]["accepted_policy_version"] = None
        portal_save(pstate)
    apply_bump_list()
    log(f"Pristanak opozvan na portalu za {mac}: {results[-1].get('status') if results else '?'}")
    return 200, {"ok": True, "state": "guest"}


class PortalHandler(BaseHTTPRequestHandler):
    server_version = "fornectd-portal"

    def log_message(self, fmt, *args):  # noqa: ANN001
        pass  # bez logovanja svakog zahtjeva (IP adrese klijenata)

    def _json(self, code: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _client_mac(self) -> str | None:
        return ip_to_mac(self.client_address[0])

    def _body(self) -> dict:
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 16384)
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, OSError):
            return {}

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/v1/portal/session":
            mac = self._client_mac()
            if not mac:
                return self._json(404, {"error": "Uređaj nije pronađen u mreži."})
            consented = consented_from_config()
            with _portal_lock:
                dev = portal_load()["devices"].get(mac, {})
            st = "consented" if mac in consented else dev.get("state", "unknown")
            return self._json(200, {
                "mac": mac,
                "device_name": dev.get("name") or mac,
                "state": st,
                "policy_version": POLICY_VERSION,
                "accepted_policy_version": dev.get("accepted_policy_version")
                if st in ("verifying", "consented") else None,
                "ca_fingerprint": ca_fingerprint(),
                "ca_url": "/v1/portal/ca.crt",
                "capacity_full": False,
                "check_url": f"https://{CHECK_HOST}/ok",
                "check_timeout_ms": 90000,
                "language": "bs",
            })
        if path == "/v1/portal/ca.crt":
            try:
                with open(CA_CERT, "rb") as f:
                    raw = f.read()
            except OSError:
                return self._json(404, {"error": "CA certifikat nije pronađen na uređaju."})
            self.send_response(200)
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="fornect-ca.crt"')
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return None
        # statika portala
        name = "index.html" if path in ("/", "") else path.lstrip("/")
        full = os.path.realpath(os.path.join(PORTAL_DIR, name))
        root = os.path.realpath(PORTAL_DIR)
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            full = os.path.join(root, "index.html")  # captive: sve nepoznato -> portal
        try:
            with open(full, "rb") as f:
                raw = f.read()
        except OSError:
            return self._json(404, {"error": "Portal nije instaliran."})
        self.send_response(200)
        self.send_header("Content-Type", PORTAL_MIME.get(os.path.splitext(full)[1], "application/octet-stream"))
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)
        return None

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        parts = path.strip("/").split("/")
        mac = self._client_mac()
        # Klijent smije mijenjati samo SVOJ uređaj: MAC iz putanje mora biti
        # MAC s kojeg zahtjev stvarno dolazi (ARP), inače bi bilo ko na
        # mreži mogao dati ili opozvati pristanak za tuđi telefon.
        try:
            if len(parts) == 4 and parts[:2] == ["v1", "devices"] and parts[3] == "classify":
                target = _norm_mac(urllib.request.unquote(parts[2]))
                if not mac or target != mac:
                    return self._json(403, {"error": "Možete mijenjati samo ovaj uređaj."})
                code, body = portal_classify(mac, self._body())
                return self._json(code, body)
            if len(parts) == 4 and parts[:2] == ["v1", "consent"] and parts[3] == "revoke":
                target = _norm_mac(urllib.request.unquote(parts[2]))
                if not mac or target != mac:
                    return self._json(403, {"error": "Možete mijenjati samo ovaj uređaj."})
                code, body = portal_revoke(mac)
                return self._json(code, body)
        except ApiError as e:
            log(f"Portal: oblak odbio zahtjev: {e}")
            return self._json(502, {"error": "Oblak trenutno nije dostupan ili je odbio zahtjev."})
        except (urllib.error.URLError, OSError) as e:
            log(f"Portal: oblak nedostupan: {e}")
            return self._json(502, {"error": "Oblak trenutno nije dostupan."})
        return self._json(404, {"error": "Nepoznata ruta."})


def verification_watcher() -> None:
    """Prati Squid access log: dekriptovan zahtjev ka CHECK_HOST = certifikat radi."""
    offset = None
    while _running:
        try:
            size = os.path.getsize(SQUID_LOG)
            if offset is None or size < offset:
                offset = size  # start ili rotacija loga: čitaj samo novo
            if size > offset:
                with open(SQUID_LOG, encoding="utf-8", errors="replace") as f:
                    f.seek(offset)
                    chunk = f.read()
                    offset = f.tell()
                for line in chunk.splitlines():
                    cols = line.split()
                    # native format: time elapsed client code/status bytes METHOD URL ...
                    if len(cols) < 7 or cols[5] == "CONNECT" or f"://{CHECK_HOST}/" not in cols[6]:
                        continue
                    mac = ip_to_mac(cols[2])
                    if not mac:
                        continue
                    with _portal_lock:
                        pstate = portal_load()
                        dev = pstate["devices"].get(mac)
                        if not dev or dev.get("state") != "verifying":
                            continue
                    try:
                        results = send_events([{
                            "event_id": f"verified-{mac}-{int(time.time())}",
                            "type": "consent.verified", "mac": mac, "at": now_iso(),
                        }])
                    except (ApiError, urllib.error.URLError, OSError) as e:
                        log(f"Provjera certifikata za {mac} uspjela, ali oblak nedostupan: {e}")
                        continue
                    status = results[-1].get("status") if results else "?"
                    if status in ("applied", "duplicate"):
                        with _portal_lock:
                            pstate = portal_load()
                            pstate["devices"][mac]["state"] = "consented"
                            portal_save(pstate)
                        log(f"Certifikat potvrđen za {mac} — puna zaštita.")
                    else:
                        log(f"consent.verified za {mac} odbijen: {results[-1].get('reason') if results else ''}")
        except FileNotFoundError:
            pass
        except Exception as e:  # noqa: BLE001
            log(f"Watcher greška: {e!r}")
        time.sleep(2)


# Captive detekcija: telefon/laptop odmah po spajanju na WiFi provjeri
# jednu od ovih adresa. Pi-hole ih usmjeri na ovaj uređaj (dns.hosts).
# Uređaj koji se još nije izjasnio dobije preusmjerenje na portal, pa mu
# sistem sam otvori prozor "Prijava na mrežu". Uređaj koji se izjasnio
# dobije tačno odgovor koji sistem očekuje i ništa se ne otvara.
CAPTIVE_PORT = int(os.environ.get("FORNECT_CAPTIVE_PORT", "80"))
PIHOLE_ADMIN_PORT = int(os.environ.get("FORNECT_PIHOLE_ADMIN_PORT", "8081"))
CAPTIVE_DOMAINS = [
    "connectivitycheck.gstatic.com",
    "connectivitycheck.android.com",
    "clients3.google.com",
    "captive.apple.com",
    "www.msftconnecttest.com",
    "www.msftncsi.com",
    "detectportal.firefox.com",
    "nmcheck.gnome.org",
    "connectivity-check.ubuntu.com",
    "connectivitycheck.platform.hicloud.com",
    "connect.rom.miui.com",
]
APPLE_SUCCESS = b"<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>"


def client_decided(mac: str | None) -> bool:
    if not mac:
        return True  # ne znamo ko je — ne gnjavi ga portalom
    if mac in consented_from_config():
        return True
    with _portal_lock:
        st = portal_load()["devices"].get(mac, {}).get("state", "unknown")
    return st in ("guest", "verifying", "consented")


class CaptiveHandler(BaseHTTPRequestHandler):
    server_version = "fornectd-captive"

    def log_message(self, fmt, *args):  # noqa: ANN001
        pass

    def _send(self, code: int, body: bytes = b"", ctype: str = "text/plain", headers: dict | None = None) -> None:
        self.send_response(code)
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        if code != 204:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):  # noqa: N802
        self.do_GET()

    def do_GET(self):  # noqa: N802
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        path = self.path.split("?", 1)[0]
        me = self.connection.getsockname()[0]

        if path.startswith("/admin"):
            # Pi-hole admin je preseljen s porta 80.
            return self._send(302, headers={"Location": f"http://{me}:{PIHOLE_ADMIN_PORT}{self.path}"})

        mac = ip_to_mac(self.client_address[0])
        if not client_decided(mac):
            return self._send(302, headers={"Location": f"http://{me}:{PORTAL_PORT}/"})

        # Izjasnio se: odgovori onako kako sistem očekuje da je internet OK.
        if "apple.com" in host:
            return self._send(200, APPLE_SUCCESS, "text/html")
        if "msftconnecttest" in host:
            return self._send(200, b"Microsoft Connect Test")
        if "msftncsi" in host:
            return self._send(200, b"Microsoft NCSI")
        if "firefox" in host:
            return self._send(200, b"success\n")
        if "gnome.org" in host or "ubuntu.com" in host:
            return self._send(200, b"NetworkManager is online\n")
        if host in CAPTIVE_DOMAINS:
            return self._send(204)
        # Neko je otvorio IP uređaja direktno — pokaži portal.
        return self._send(302, headers={"Location": f"http://{me}:{PORTAL_PORT}/"})


def start_portal() -> None:
    if not os.path.isdir(PORTAL_DIR):
        log(f"Portal nije instaliran ({PORTAL_DIR}) — pristanak preko portala isključen.")
        return
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", PORTAL_PORT), PortalHandler)
    except OSError as e:
        log(f"Portal ne može na port {PORTAL_PORT}: {e}")
        return
    threading.Thread(target=srv.serve_forever, daemon=True, name="portal").start()
    threading.Thread(target=verification_watcher, daemon=True, name="verify").start()
    log(f"Portal radi na http://<uređaj>:{PORTAL_PORT}/")
    try:
        cap = ThreadingHTTPServer(("0.0.0.0", CAPTIVE_PORT), CaptiveHandler)
        threading.Thread(target=cap.serve_forever, daemon=True, name="captive").start()
        log(f"Captive detekcija radi na portu {CAPTIVE_PORT} (portal se sam otvara novim uređajima).")
    except OSError as e:
        log(f"Captive detekcija NE radi — port {CAPTIVE_PORT} zauzet ({e}). Je li Pi-hole admin preseljen na {PIHOLE_ADMIN_PORT}?")


# -------------------------------------------------------------- koraci

def register(state: dict) -> dict:
    log(f"Registrujem uređaj '{DEVICE_NAME}' ({DEVICE_KIND}) na {API_BASE} ...")
    res = api("POST", "/devices/register", body={"name": DEVICE_NAME, "kind": DEVICE_KIND})
    state = {
        "device_id": res["id"],
        "token": res["token"],
        "paired": False,
        "pairing_code": res.get("pairing_code"),
        "pairing_code_expires_at": res.get("pairing_code_expires_at"),
        "applied_config_version": 0,
        "registered_at": now_iso(),
    }
    save_state(state)
    log(f"Registrovan. Device id: {state['device_id']}")
    announce_code(state)
    return state


def announce_code(state: dict) -> None:
    log("=" * 50)
    log(f"  PAIRING KOD: {state.get('pairing_code')}")
    log(f"  Vrijedi do: {state.get('pairing_code_expires_at')}")
    log("  Unesi ga u Fornect aplikaciju: Uređaji -> Upari uređaj")
    log("=" * 50)


def check_pairing(state: dict) -> dict:
    """Dok uređaj nije uparen: kad kod istekne, traži novi. 409 = već uparen."""
    if state.get("paired"):
        return state
    expires = parse_iso(state.get("pairing_code_expires_at"))
    if expires and expires > dt.datetime.now(dt.timezone.utc):
        return state
    try:
        res = api("POST", f"/devices/{state['device_id']}/pairing-code", token=state["token"])
        state["pairing_code"] = res.get("pairing_code")
        state["pairing_code_expires_at"] = res.get("pairing_code_expires_at")
        save_state(state)
        log("Stari pairing kod je istekao, novi:")
        announce_code(state)
    except ApiError as e:
        if e.status == 409:
            state["paired"] = True
            state["pairing_code"] = None
            state["pairing_code_expires_at"] = None
            save_state(state)
            log("Uređaj je uparen s nalogom.")
        else:
            raise
    return state


def heartbeat(state: dict, dns: dict | None) -> None:
    stats = system_stats()
    if dns is not None:
        stats["dns"] = dns
    api(
        "POST",
        f"/devices/{state['device_id']}/heartbeat",
        token=state["token"],
        body={"stats": stats, "versions": collect_versions()},
    )


def pull_config(state: dict) -> dict:
    res = api("GET", f"/devices/{state['device_id']}/config", token=state["token"])
    version = int(res.get("version") or 0)
    applied = int(state.get("applied_config_version") or 0)
    if version <= applied:
        return state
    cfg = res.get("config_json") or {}
    save_config({"version": version, "received_at": now_iso(), "config": cfg})
    macs = cfg.get("consented_macs") or []
    lists = (cfg.get("filter_lists") or {}).get("urls") or []
    ota = cfg.get("ota") or {}
    log(
        f"Nova konfiguracija v{version}: {len(macs)} consented MAC, "
        f"{len(lists)} filter lista, OTA prsten={ota.get('ring')} pauza={ota.get('paused')}."
    )
    api("POST", f"/devices/{state['device_id']}/config/ack", token=state["token"], body={"version": version})
    state["applied_config_version"] = version
    save_state(state)
    if PROFILE == "v2":
        try:
            apply_bump_list()
        except OSError as e:
            log(f"Bump lista nije upisana: {e}")
    try:
        apply_filter_lists(cfg, state)
    except OSError as e:
        log(f"Filter liste nisu primijenjene: {e}")
    return state


# ---------------------------------------------------------------- util

def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def print_status() -> int:
    state = load_state()
    if not state:
        print("Uređaj još nije registrovan (nema /etc/fornect/agent.json).")
        return 1
    safe = {k: v for k, v in state.items() if k != "token"}
    print(json.dumps(safe, indent=2, ensure_ascii=False))
    return 0


def main() -> int:
    if "--status" in sys.argv:
        return print_status()
    if os.geteuid() != 0 and STATE_DIR == "/etc/fornect":
        log("fornectd mora raditi kao root (čita Pi-hole bazu i /etc/fornect).")
        return 1

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    log(f"fornectd {VERSION} start, API {API_BASE}")

    state = load_state()
    threading.Thread(target=dhcp_listener, daemon=True, name="dhcp").start()
    if PROFILE == "v2":
        start_portal()
        try:
            apply_bump_list()
        except OSError as e:
            log(f"Bump lista nije upisana: {e}")
    else:
        log("Profil v1: captive portal i MITM pristanak isključeni (DNS filtriranje radi).")
    backoff = 10
    last_stats_at = 0.0
    dns: dict | None = None

    while _running:
        try:
            if not state.get("device_id"):
                state = register(state)
            state = check_pairing(state)
            if time.monotonic() - last_stats_at > STATS_INTERVAL or last_stats_at == 0.0:
                dns = dns_stats_24h()
                last_stats_at = time.monotonic()
            heartbeat(state, dns)
            state = pull_config(state)
            retry_gravity_if_needed()
            try:
                state = scan_threats(state)
            except (ApiError, OSError) as e:
                log(f"Prevare: provjera nije uspjela ({e}), ponovo u sljedećem krugu.")
            try:
                state = report_lan(state)
                if not state.get("paired"):
                    # Backend prima prisutnost samo od uparenog uređaja,
                    # pa je uspjeh ovdje najbrži dokaz da je uparen.
                    state["paired"] = True
                    state["pairing_code"] = None
                    state["pairing_code_expires_at"] = None
                    save_state(state)
                    log("Uređaj je uparen s nalogom.")
            except ApiError as e:
                if e.status != 409:  # 409 = još nije uparen, normalno
                    raise
            backoff = 10
            sleep_for = HEARTBEAT_INTERVAL
        except ApiError as e:
            if e.status == 401:
                log(
                    "Backend ne prepoznaje token (401). Uređaj je možda obrisan u panelu. "
                    f"Za novu registraciju obriši {STATE_FILE} i restartuj servis."
                )
                sleep_for = 300
            else:
                log(f"Greška API-ja: {e}")
                sleep_for = backoff
                backoff = min(backoff * 2, 300)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            log(f"Mreža nedostupna: {e}")
            sleep_for = backoff
            backoff = min(backoff * 2, 300)
        except Exception as e:  # noqa: BLE001 — agent ne smije pasti na neočekivanoj grešci
            log(f"Neočekivana greška: {e!r}")
            sleep_for = backoff
            backoff = min(backoff * 2, 300)

        end = time.monotonic() + sleep_for
        while _running and time.monotonic() < end:
            time.sleep(1)

    log("fornectd zaustavljen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
