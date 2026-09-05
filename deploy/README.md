# Produkcijski deploy — reverse proxy / routing

Frontend očekuje da `/api/v1` bude na **istom originu** kao i sam
frontend (`API_BASE_URL` u `src/app/core/config/api.config.ts` je
relativan `'/api/v1'`). Ovo dokumentuje kako to postići u produkciji
na Dokploy VPS-u.

## Dva pristupa

### A) nginx ugrađen u frontend Docker image (implementirano ovdje)

Root `Dockerfile` gradi Angular produkcijski build i pakuje ga sa
nginx-om u jednu sliku (`deploy/nginx.conf.template`). Ta slika je
**posebna Dokploy aplikacija/servis** od backend-a
(`server/Dockerfile`, već postoji, odvojen servis). nginx servira
statičke fajlove i proxy-ja `/api/*` ka backend servisu preko
Dokploy-eve interne Docker mreže (`BACKEND_HOST`/`BACKEND_PORT` env
varijable, supstituisane nginx-ovim ugrađenim envsubst mehanizmom pri
startu kontejnera — ne hardkodirano).

**Prednosti:**
- Portabilno — ista slika radi identično u Dokploy-u, plain Docker-u,
  docker-compose-u, bilo gdje. Nije zaključano za Dokploy-specifičan
  mehanizam rutiranja.
- Testabilno lokalno (`docker build && docker run`), bez potrebe za
  stvarnim Dokploy deployom da bi se provjerilo da rutiranje radi.
- Nastavlja postojeći obrazac iz repoa — `server/Dockerfile` je već
  "svaki servis nosi svoj kompletan Dockerfile"; ovo mu ne dodaje
  drugi, platform-specifičan mehanizam konfiguracije uz njega.
- Konfiguracija rutiranja je **u git-u** (`deploy/nginx.conf.template`),
  pa se može pregledati kroz PR i reprodukovati iz čistog Dokploy
  projekta bez spoljne dokumentacije.

### B) Dokploy-ov ugrađeni reverse proxy (Traefik), bez nginx-a

Dokploy interno koristi Traefik kao ingress reverse proxy za sve
deployane aplikacije. Umjesto ugrađivanja nginx-a, frontend bi mogao
biti deployan kao Dokploy "static site" (ili bilo koji minimalni
static server), a Traefik konfigurisan (kroz Dokploy-evu "Domains"
sekciju, sa path-based pravilima) da `/api` prefiks rutira direktno
na backend servis, a sve ostalo na frontend.

**Prednosti:** jedan manje hop u lancu (Traefik → app, umjesto
Traefik → nginx → statički fajlovi/backend), manje za održavati u
samom repou.

**Mane:** pravila rutiranja žive u Dokploy UI/bazi, ne u git-u —
gubi se "infrastructure as code" (teže za review kroz PR, teže
reprodukovati deploy iz čistog Dokploy projekta bez spoljne
dokumentacije), i vezuje deploy specifično za Dokploy (migracija na
drugi host/platformu bi tražila potpuno drugačiji mehanizam
rutiranja).

## Preporuka

**Pristup A** (implementiran u ovom PR-u) — portabilnost i
mogućnost lokalnog testiranja pretežu nad uštedom jednog hop-a, a
"infrastructure as code" (config u git-u, ne u platform UI-ju) je
vrijedniji za tim koji radi kroz PR-ove.

## Postavljanje u Dokploy-u

1. **Backend servis** (`server/Dockerfile`, već postoji) — deployati
   kao zasebnu Dokploy aplikaciju, sa env varijablama iz
   `server/.env.example` (`DATABASE_URL`, `JWT_SECRET`,
   `ADMIN_API_KEY`, `PORT`, ...).
2. **Frontend servis** (root `Dockerfile`, ovaj PR) — deployati kao
   drugu Dokploy aplikaciju, u ISTOM Dokploy projektu kao backend (da
   dijele internu Docker mrežu). Postaviti env varijable:
   - `BACKEND_HOST` — interno ime backend servisa (Dokploy ga
     dodjeljuje automatski; obično isto kao naziv aplikacije)
   - `BACKEND_PORT` — mora odgovarati backend-ovom `PORT`-u
3. Frontend servisu dodijeliti javni domen/port (80) — to je jedina
   javno izložena tačka; backend servis ne mora imati javni port.
4. Zdravstvena provjera (health check) na backend servisu treba
   ciljati `GET /api/v1/health` (vidi zadatak 3).

## Lokalno isprobavanje

```bash
docker build -t fornect-frontend .
docker run -p 8080:80 -e BACKEND_HOST=host.docker.internal -e BACKEND_PORT=3000 fornect-frontend
# http://localhost:8080 — frontend, /api/* ide na backend na hostu
```
