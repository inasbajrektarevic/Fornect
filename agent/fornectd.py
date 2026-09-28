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

Konfiguracija se još NE primjenjuje na Pi-hole/nftables — samo se prima i
potvrđuje. Primjena lista i consented_macs dolazi u v0.3.

Samo standardna Python biblioteka (Python >= 3.9), bez pip paketa.

Upotreba:
  fornectd.py            pokreni agenta (za systemd)
  fornectd.py --status   ispiši stanje (id, uparen, pairing kod) bez tokena
"""

from __future__ import annotations

import datetime as dt
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

VERSION = "0.2.0"

API_BASE = os.environ.get("FORNECT_API", "https://admin.lukmandavran.cc/api/v1").rstrip("/")
STATE_DIR = os.environ.get("FORNECT_STATE_DIR", "/etc/fornect")
STATE_FILE = os.path.join(STATE_DIR, "agent.json")
CONFIG_FILE = os.path.join(STATE_DIR, "config.json")
DEVICE_NAME = os.environ.get("FORNECT_DEVICE_NAME", socket.gethostname())
DEVICE_KIND = os.environ.get("FORNECT_DEVICE_KIND", "home")
PIHOLE_DB = os.environ.get("FORNECT_PIHOLE_DB", "/etc/pihole/pihole-FTL.db")

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


def discover_lan() -> dict[str, dict]:
    """MAC -> {ip, name}. Izvori: ARP tabela uređaja + Pi-hole mrežna tabela.

    Svi klijenti koriste Pi-hole kao DNS, pa ih Pi-hole vidi i pamti MAC
    (iz ARP-a). Ruter se izostavlja — on nije klijentski uređaj.
    """
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


def report_lan(state: dict) -> dict:
    """Novi MAC -> device.new event (red "Novi uređaji"); svi viđeni -> network-presence."""
    lan = discover_lan()
    known = set(state.get("known_macs") or [])
    new = [m for m in lan if m not in known]
    if new:
        events = [
            {
                "event_id": f"new-{mac}",
                "type": "device.new",
                "mac": mac,
                "at": now_iso(),
                "name": lan[mac].get("name") or None,
            }
            for mac in new[:200]
        ]
        res = api("POST", f"/devices/{state['device_id']}/events", token=state["token"], body={"events": events})
        accepted = {
            r["event_id"][4:]
            for r in res.get("results", [])
            if r.get("status") in ("applied", "duplicate")
        }
        known |= accepted
        state["known_macs"] = sorted(known)
        save_state(state)
        applied = sum(1 for r in res.get("results", []) if r.get("status") == "applied")
        if applied:
            log(f"Javljeno {applied} novih uređaja na mreži (red 'Novi uređaji' u panelu).")
    res = api(
        "POST",
        f"/devices/{state['device_id']}/network-presence",
        token=state["token"],
        body={"macs": sorted(lan)},
    )
    if res.get("changed"):
        log(f"Prisutnost: {len(lan)} uređaja na mreži, {res['changed']} promjena statusa.")
    return state


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
        f"{len(lists)} filter lista, OTA prsten={ota.get('ring')} pauza={ota.get('paused')}. "
        "(v0.1: sačuvano, još se ne primjenjuje)"
    )
    api("POST", f"/devices/{state['device_id']}/config/ack", token=state["token"], body={"version": version})
    state["applied_config_version"] = version
    save_state(state)
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
