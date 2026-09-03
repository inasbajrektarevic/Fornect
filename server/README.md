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
| POST | `/api/v1/devices/register` | Registruje novi hub, vraća `token` (samo jednom). |
| POST | `/api/v1/devices/:id/heartbeat` | Heartbeat, ažurira `status`/`last_seen_at`. |
| GET | `/api/v1/devices/:id/config` | Vraća zadnju verziju konfiguracije. |
| POST | `/api/v1/devices/:id/config/ack` | Potvrđuje primljenu verziju konfiguracije. |

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

### App (mobilna/admin app) — Bearer JWT (`Authorization: Bearer <token iz login-a>`)

| Metoda | Ruta | Opis |
| --- | --- | --- |
| GET | `/api/v1/app/network-devices` | Svi uređaji trenutnog naloga. |
| POST | `/api/v1/app/network-devices` | Dodaje novi (`mac_address`, `name` obavezni). |
| PATCH | `/api/v1/app/network-devices/:id` | Izmjena profila/imena/restrictions/schedule/pairing_state... |
| DELETE | `/api/v1/app/network-devices/:id` | Briše uređaj. |
| GET | `/api/v1/app/hub` | Fornect hub uparen sa nalogom (`kind`, `mode`, `capacity`, `online`, `connected_devices`). |

## Automatska sinhronizacija `consented_macs`

Kad PATCH ili DELETE na `/api/v1/app/network-devices/:id` promijeni
`pairing_state` u ili iz `'paired'`, backend (u `services/device-config-sync.ts`)
automatski upisuje novi red u `device_configs` sa uvećanom verzijom:

```json
{ "consented_macs": ["aa:bb:cc:dd:ee:ff", "..."] }
```

Lista sadrži sve MAC adrese tog naloga uparene (`pairing_state = 'paired'`)
sa istim fizičkim hub-om (`fornect_device_id`) na koji se promjena odnosi.
Orange Pi agent to povlači kroz `GET /api/v1/devices/:id/config` i upisuje
u nftables set `consented_macs`.

## Napomene / odluke

- `devices.token` se nikad ne čuva u bazi — čuva se samo sha256 otisak
  (`token_hash`); sam token se vraća uređaju samo jednom, pri registraciji.
- `POST /api/v1/devices/register` je namjerno bez auth-a (uređaj ga zove
  prije nego dobije token) — u produkciji tu rutu treba zaštititi na
  mrežnom nivou (VPN/allowlist), ne oslanjati se samo na aplikaciju.
- `GET /api/v1/devices/:id/config` vraća `{ version: 0, config_json: {} }`
  umjesto 404 kad još ne postoji nijedna konfiguracija, da agent ne mora
  posebno rukovati tim slučajem.
- Hub jednog naloga se određuje preko prvog `network_devices` zapisa koji
  ima postavljen `fornect_device_id` — pokriva uobičajeni Home slučaj
  (jedan nalog = jedan hub). Pro/agency nalozi sa više hub-ova bi trebali
  posebnu rutu za listanje svih hub-ova, van obima ovog zadatka.
