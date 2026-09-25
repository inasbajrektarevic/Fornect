# Fornect backend

Fastify + TypeScript + PostgreSQL API za Fornect Sentinel:

- rute koje zove sam Orange Pi/RK3568 hub (provisioning, heartbeat, config)
- interne admin rute (X-Admin-Key)
- rute za korisničke naloge i admin/mobilnu app (`/api/v1/app/*`, JWT)

## Pokretanje lokalno

```bash
cd server
npm install
cp .env.example .env   # popuni DATABASE_URL, JWT_SECRET, ADMIN_API_KEY
npm run migrate        # primijeni SQL migracije iz migrations/
npm run dev            # tsx watch, http://localhost:3000
```

`npm run build && npm start` pokreće kompajliranu produkcionu verziju
(`dist/server.js`). `npm run migrate` je bezbjedno pokrenuti više puta —
primjenjuje samo migracije koje još nisu u `schema_migrations` tabeli.

## Deploy (Dokploy)

`server/Dockerfile` gradi standalone image (odvojen od Angular
frontenda u ovom repou). Prije prvog deploya (ili nakon dodavanja nove
migracije) pokrenuti `npm run migrate` protiv produkcione baze —
najlakše kao one-off komanda unutar istog image-a, npr.
`docker run --env-file .env <image> node scripts/migrate.js`.

## Rute

### Uređaji (Orange Pi agent) — Bearer token

| Metoda | Ruta | Opis |
| --- | --- | --- |
| POST | `/api/v1/devices/register` | Registruje novi hub, vraća `token` (samo jednom) i kod za uparivanje. Bez auth-a, ograničeno po IP-u (`DEVICE_REGISTER_MAX_PER_HOUR`). |
| POST | `/api/v1/devices/:id/pairing-code` | Nov kod za uparivanje kad prethodni istekne. |
| POST | `/api/v1/devices/:id/heartbeat` | Heartbeat; neobavezno `versions` za inventar verzija. |
| POST | `/api/v1/devices/:id/network-presence` | Koje MAC adrese hub trenutno vidi — izvor obavještenja o odlasku sa mreže. |
| POST | `/api/v1/devices/:id/events` | Paket eventa (`device.new`, `device.classified`, `consent.revoked`, `consent.verify_failed`), idempotentan po `event_id`. |
| POST | `/api/v1/devices/:id/ca` | Hub prijavljuje svoj CA certifikat (javni dio i otisak). |
| GET | `/api/v1/devices/:id/config` | Vraća zadnju verziju konfiguracije. |
| POST | `/api/v1/devices/:id/config/ack` | Potvrđuje primljenu verziju konfiguracije. |
| GET | `/api/v1/devices/:id/portal-bundle` | Tekst i brend captive portala; `?version=` vraća 304 ako se ništa nije promijenilo. |

### Admin — `X-Admin-Key` header

| Metoda | Ruta | Opis |
| --- | --- | --- |
| GET | `/api/v1/admin/devices` | Lista svih hub-ova. |
| GET | `/api/v1/admin/devices/:id` | Detalji + zadnja konfiguracija. |
| PATCH | `/api/v1/admin/devices/:id` | Izmjena `name`/`kind`/`mode`/`capacity`. |
| POST | `/api/v1/admin/devices/:id/config` | Ručno guranje nove verzije konfiguracije. |

### Auth

| Metoda | Ruta | Opis |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | `{ name, email, password }` → novi account. |
| POST | `/api/v1/auth/login` | `{ email, password }` → `{ token, account }`. |
| GET | `/api/v1/auth/me` | Bearer JWT → trenutni account. |
| POST | `/api/v1/auth/verify-email` | Potvrda email adrese kodom. Kod **nijedna** ruta ne vraća — u razvoju je u `.mail-outbox/`. |
| POST | `/api/v1/auth/resend-verification` | Nov kod za potvrdu. |
| POST | `/api/v1/auth/forgot-password` | `{ email }` → kod za novu lozinku na mail. Odgovor je isti postojao nalog ili ne. Najviše jedan kod u minuti i pet u 24 sata po nalogu. |
| POST | `/api/v1/auth/reset-password` | `{ email, code, password }` → nova lozinka. Pet pokušaja po kodu. Tokeni izdati prije promjene prestaju važiti. |

### App (mobilna/admin app) — Bearer JWT (`Authorization: Bearer <token iz login-a>`)

| Metoda | Ruta | Opis |
| --- | --- | --- |
| GET | `/api/v1/app/network-devices` | Svi uređaji trenutnog naloga. |
| POST | `/api/v1/app/network-devices` | Dodaje novi (`mac_address`, `name` obavezni). `pairing_state` samo `unpaired` ili `guest`. |
| PATCH | `/api/v1/app/network-devices/:id` | Izmjena profila/imena/restrictions/schedule. `pairing_state` samo `unpaired`→`guest` i, uz važeći pristanak, `failed`/`paired`→`pairing`. U `paired` vodi isključivo pristanak + `/consent/verify`. Puna zaštita (`protection_level: full`) samo za `paired` uređaj. |
| DELETE | `/api/v1/app/network-devices/:id` | Briše uređaj. |
| GET | `/api/v1/app/hub` | Fornect hub uparen sa nalogom (`kind`, `mode`, `capacity`, `online`, `connected_devices`). |
| POST | `/api/v1/app/hub/claim` | Uparivanje huba kodom. Ograničeno po IP-u (`HUB_CLAIM_MAX_PER_HOUR`). |
| GET | `/api/v1/app/notifications` | Obavještenja naloga; stanja (kapacitet, pristanak) se računaju pri čitanju. |
| POST | `/api/v1/app/notifications/read-all`, `/:id/read` | Označavanje pročitanog. |
| GET | `/api/v1/app/consent-policy`, `/consent-records` | Važeća verzija politike i zapisi pristanka. |
| GET/POST | `/api/v1/app/network-devices/:id/consent` | Pristanak uređaja; `/verify` i `/revoke` za provjeru i opoziv. |
| GET | `/api/v1/app/network-devices/:id/ca` | CA certifikat za instalaciju na uređaj. |
| GET/PUT | `/api/v1/app/portal-settings` | Tekst i brend captive portala. |
| GET | `/api/v1/app/fleet` | Fleet / OTA: hub-ovi naloga sa verzijama, prstenom, prozorom i setom lista. |
| PUT | `/api/v1/app/fleet/:id/ota` | Prsten, pauza, prozor održavanja. |
| GET/PUT | `/api/v1/app/fleet/:id/lists` | Historija i nov set filter lista (Ultimate/TIF odbijeni na Home). |
| POST | `/api/v1/app/fleet/:id/lists/rollback` | Vraćanje prethodnog seta. |
| POST | `/api/v1/app/fleet/bulk` | Grupne komande: pauza, nastavak, poništavanje seta. |

## Konfiguracija uređaja (`device_configs`)

Svaka izmjena koja se tiče huba — uparen uređaj, pristanak, OTA postavke,
set filter lista — prolazi kroz jedno mjesto, `syncDeviceConfig` u
`services/device-config-sync.ts`, koje upisuje novi red u `device_configs`
sa uvećanom verzijom. Agent ga povlači kroz `GET /api/v1/devices/:id/config`.

`config_json` je **uvijek potpun objekat** — `consented_macs`, `ota` i
`filter_lists` — a ne samo dio koji se promijenio. Parcijalan upis bi tiho
obrisao ono što je upisao neko drugi (npr. snimanje prozora održavanja bi
obrisalo sve consented MAC adrese). Isti config se ne upisuje dvaput.

`consented_macs` sadrži MAC adrese uparene sa tim hub-om, **bez** onih preko
kapaciteta licence (Zadatak 1, Tačka 4, sloj L1). Sve MAC adrese su u obliku
`aa:bb:cc:dd:ee:ff` — baza drugi oblik ne prima (migracija 019).

Tačan oblik i šta uređaj s njim mora uraditi:
[`docs/fleet-ota-kontrakt.md`](../docs/fleet-ota-kontrakt.md).

## Napomene / odluke

- `devices.token` se nikad ne čuva u bazi — čuva se samo sha256 otisak
  (`token_hash`); sam token se vraća uređaju samo jednom, pri registraciji.
- `POST /api/v1/devices/register` je namjerno bez auth-a (uređaj ga zove
  prije nego dobije token) — u produkciji tu rutu treba zaštititi na
  mrežnom nivou (VPN/allowlist), ne oslanjati se samo na aplikaciju.
- `GET /api/v1/devices/:id/config` vraća `{ version: 0, config_json: {} }`
  umjesto 404 kad još ne postoji nijedna konfiguracija, da agent ne mora
  posebno rukovati tim slučajem.
- Hub jednog naloga za `/app/hub` i za nove uređaje je najstariji hub
  uparen sa nalogom (`devices.claimed_by_account_id`) — pokriva uobičajeni
  Home slučaj (jedan nalog = jedan hub). Svi hub-ovi naloga se vide kroz
  `/app/fleet`.
