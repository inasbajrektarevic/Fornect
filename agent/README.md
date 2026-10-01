# fornectd — agent na uređaju

Povezuje fizički Fornect uređaj (Orange Pi / R76S) s panelom na
`https://admin.lukmandavran.cc/api/v1`. Samo standardna Python biblioteka.

## Šta radi (v0.6)

| Korak | Ruta | Status |
|---|---|---|
| Registracija, dobija id + token + pairing kod | `POST /devices/register` | radi |
| Novi pairing kod kad istekne, otkriva da je uparen (409) | `POST /devices/:id/pairing-code` | radi |
| Heartbeat svakih 60 s: verzije, RAM, uptime, servisi, DNS 24h | `POST /devices/:id/heartbeat` | radi |
| Povlači konfiguraciju, čuva je, potvrđuje | `GET /devices/:id/config`, `POST .../config/ack` | radi |
| Novi uređaji na mreži → red "Novi uređaji" u panelu | `POST /devices/:id/events` (`device.new`) | radi (v0.2) |
| Online/offline uređaja na mreži | `POST /devices/:id/network-presence` | radi (v0.2) |
| Portal na `:8080` (uslovi, pristanak, CA certifikat) | lokalno `/v1/portal/*`, `/v1/devices/{mac}/classify`, `/v1/consent/{mac}/revoke` | radi (v0.3) |
| Pristanak s portala → oblak | `device.classified` (state consented, method portal) | radi (v0.3) |
| Potvrda certifikata: dekriptovan zahtjev ka `check.fornect.local` u Squid logu | `consent.verified` (novo, migracija 022) | radi (v0.3) |
| consented_macs iz konfiguracije → Squid bump lista | `/etc/squid/fornect/bump-macs.txt` + `squid -k reconfigure` | radi (v0.3) |
| Portal se sam otvara novom uređaju na WiFi-ju (captive detekcija na :80) | Pi-hole `dns.hosts` → uređaj | radi (v0.4) |
| Pravo ime uređaja (iz DHCP zahtjeva koje uređaj pošalje pri spajanju, port 67, samo sluša) | `device.new` s imenom; backend ga upiše samo dok je ime još MAC | radi (v0.5) |
| Primjena lista za filtriranje na Pi-hole (gravity.db + `pihole -g`) | `GET /devices/:id/config` → gravity.db | radi (v0.6) |

Token je u `/etc/fornect/agent.json` (0600, root). Nikad se ne ispisuje.
Primljena konfiguracija: `/etc/fornect/config.json`.

## Instalacija na Orange Pi

S Windows PC-a (PowerShell, u `C:\Users\DELL\Fornect`):

```
scp agent\fornectd.py agent\fornectd.service root@192.168.1.102:/tmp/
```

Na Orange Pi-u (SSH kao root):

```
install -d -m 755 /opt/fornect
install -m 755 /tmp/fornectd.py /opt/fornect/fornectd.py
install -m 644 /tmp/fornectd.service /etc/systemd/system/fornectd.service
systemctl daemon-reload
systemctl enable --now fornectd
sleep 5; journalctl -u fornectd -n 20 --no-pager
```

U logu piše `PAIRING KOD: xxxxxx`. Unesi ga u aplikaciju (Uređaji → Upari uređaj).

## Pi-hole za captive (obavezno za v0.4)

Port 80 treba agentu, pa Pi-hole admin ide na 8081
(`http://192.168.1.102:8081/admin`). Adrese za provjeru interneta se
usmjere na uređaj:

```
pihole-FTL --config webserver.port '8081o,443os,[::]:8081o,[::]:443os'
pihole-FTL --config dns.hosts '["192.168.1.102 connectivitycheck.gstatic.com","192.168.1.102 connectivitycheck.android.com","192.168.1.102 clients3.google.com","192.168.1.102 captive.apple.com","192.168.1.102 www.msftconnecttest.com","192.168.1.102 www.msftncsi.com","192.168.1.102 detectportal.firefox.com","192.168.1.102 nmcheck.gnome.org","192.168.1.102 connectivity-check.ubuntu.com","192.168.1.102 connectivitycheck.platform.hicloud.com","192.168.1.102 connect.rom.miui.com","192.168.1.102 check.fornect.local"]'
systemctl restart pihole-FTL fornectd
```

Neodlučen uređaj dobije preusmjerenje na portal; uređaj koji je izabrao
osnovnu ili punu zaštitu dobije normalan odgovor i ništa se ne otvara.
Uređaj koji je u panelu klasifikovan (a ne na portalu) agent još ne zna,
pa mu se portal i dalje otvara — to je sljedeći korak.

## Squid (obavezno za v0.3)

Presreće se SAMO MAC koji je u bump listi (pristanak ili provjera u toku).
Sve ostalo prolazi bez presretanja. Aplikacije s pinningom se nikad ne diraju.

```
acl step1 at_step SslBump1
acl fornect_bump arp "/etc/squid/fornect/bump-macs.txt"
acl pinned_apps ssl::server_name "/etc/squid/fornect/splice-domains.txt"
ssl_bump peek step1
ssl_bump splice pinned_apps
ssl_bump bump fornect_bump
ssl_bump splice all
```

Klijent u MAC listi mora biti u istoj mreži kao uređaj (arp ACL radi samo
na lokalnoj mreži). Na Orange Pi Zero se za test telefon ručno postavi
proxy `192.168.1.102:3128`; uređaj nije u putanji ostalog prometa.

## Korisne komande

```
python3 /opt/fornect/fornectd.py --status   # stanje bez tokena
journalctl -u fornectd -f                   # log uživo
systemctl restart fornectd
```

Nova registracija (npr. uređaj obrisan u panelu):
`systemctl stop fornectd && rm /etc/fornect/agent.json && systemctl start fornectd`

## Poznata ograničenja

- Uređaje na mreži vidi preko ARP tabele i Pi-hole mrežne tabele. Uređaj
  koji ne koristi Pi-hole kao DNS (ručni DNS, VPN) vidi se samo dok je u ARP-u.
- Ime se sazna tek kad uređaj pošalje DHCP zahtjev (spajanje na WiFi ili
  obnova adrese). Uređaji spojeni od ranije dobiju ime nakon ponovnog
  spajanja. iPhone s "Private Wi-Fi Address" često ne šalje ime; tada ostaje
  MAC dok ga vlasnik ne preimenuje. Ime koje je vlasnik dao se ne prepisuje.
- Konfiguracija se prima i potvrđuje, ali se NE primjenjuje.

## Testirano

28.09.2026. v0.5 lokalno: DHCP zahtjev s imenom "Galaxy-S23" / android-dhcp →
postojeći uređaj preimenovan u "Galaxy S23", tip phone; "DESKTOP-LUKMAN"
(MSFT 5.0) → nov uređaj s imenom; ime koje je vlasnik ručno dao ostaje.

28.09.2026. v0.3 na lokalnoj kopiji backenda (+ migracija 022): session →
unknown; tuđi MAC → 403; pristanak bez imena → 400; pristanak → verifying,
MAC u bump listi, u oblaku `pairing` + consent_record (method portal, CA
otisak); linija `GET https://check.fornect.local/ok` u Squid logu →
consent.verified → oblak `paired`/`full`, config v2 s MAC-om, portal
`consented`; opoziv → oblak `guest`, config v3 prazan, bump lista prazna.

28.09.2026. v0.2 na lokalnoj kopiji backenda: dva MAC-a iz ARP-a (ruter i
FAILED unosi izostavljeni, velika slova normalizovana) → 2 nova uređaja
`unpaired` + online; uređaj nestao iz ARP-a → offline; ponovljeni
`device.new` se ne duplira. Uparenost se sad otkriva odmah (presence 200).


28.09.2026. na lokalnoj kopiji backenda (commit 96b87f4): registracija →
heartbeat (status online, verzije u bazi) → uparivanje kroz
`/app/hub/claim` (aplikacija vidi `online: true`) → promjena OTA prstena u
panelu → agent povukao config v1 i potvrdio (acked) → otkrivanje uparenosti
(409) → čisto gašenje na SIGTERM. Isti dan instaliran na Orange Pi i uparen (panel: Online).
