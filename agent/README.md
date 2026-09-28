# fornectd — agent na uređaju

Povezuje fizički Fornect uređaj (Orange Pi / R76S) s panelom na
`https://admin.lukmandavran.cc/api/v1`. Samo standardna Python biblioteka.

## Šta radi (v0.1)

| Korak | Ruta | Status |
|---|---|---|
| Registracija, dobija id + token + pairing kod | `POST /devices/register` | radi |
| Novi pairing kod kad istekne, otkriva da je uparen (409) | `POST /devices/:id/pairing-code` | radi |
| Heartbeat svakih 60 s: verzije, RAM, uptime, servisi, DNS 24h | `POST /devices/:id/heartbeat` | radi |
| Povlači konfiguraciju, čuva je, potvrđuje | `GET /devices/:id/config`, `POST .../config/ack` | radi |
| Primjena lista na Pi-hole, consented_macs u nftables | — | **v0.2, nije urađeno** |

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

## Korisne komande

```
python3 /opt/fornect/fornectd.py --status   # stanje bez tokena
journalctl -u fornectd -f                   # log uživo
systemctl restart fornectd
```

Nova registracija (npr. uređaj obrisan u panelu):
`systemctl stop fornectd && rm /etc/fornect/agent.json && systemctl start fornectd`

## Poznata ograničenja v0.1

- Uređaj sazna da je uparen tek kad mu pairing kod istekne (do 15 min),
  jer backend nema rutu "da li sam uparen". Aplikacija to vidi odmah.
- Konfiguracija se prima i potvrđuje, ali se NE primjenjuje.
- `network-presence` i `events` se još ne šalju.

## Testirano

28.09.2026. na lokalnoj kopiji backenda (commit 96b87f4): registracija →
heartbeat (status online, verzije u bazi) → uparivanje kroz
`/app/hub/claim` (aplikacija vidi `online: true`) → promjena OTA prstena u
panelu → agent povukao config v1 i potvrdio (acked) → otkrivanje uparenosti
(409) → čisto gašenje na SIGTERM. Na Orange Pi-u još nije pokrenut.
