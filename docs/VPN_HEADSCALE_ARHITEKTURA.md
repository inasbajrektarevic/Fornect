# VPN / Headscale — zaštita izvan kuće

Zadatak 5 (eLabFTW id 59). Kod: `server/src/services/headscale.ts`,
`server/src/routes/vpn.ts`, `server/migrations/020_add_vpn_accounts.sql`.

Ovaj dokument je napisan 25.09.2026. iz stvarnog koda i zapisa u Zadatku 5.
Raniji dokument pod istim imenom (spominje se u zapisu od 17.09.) nije
nađen ni na disku ni u repozitoriju. Ako se pojavi, uporediti ga s ovim —
ne zamijeniti ovaj bez provjere.

Svaka tvrdnja ispod nosi oznaku:

- **[kod]** — pročitano u kodu na `main`-u,
- **[eLab dd.mm.]** — zapisano u dnevniku tog dana, danas NIJE ponovo provjereno,
- **[provjereno 25.09.]** — provjereno danas na produkciji,
- **[nije provjereno]** — pretpostavka ili nešto što niko nije isprobao.

---

## 1. Čemu služi

Kod kuće uređaj štiti hub (DNS filtriranje, a uz pristanak i presretanje).
Kad telefon ode na mobilne podatke ili tuđi Wi-Fi, hub ga više ne vidi.
Ideja: telefon ulazi u privatnu VPN mrežu (tailnet) svog naloga i saobraćaj
šalje kroz kućni hub, pa zaštita ostaje ista i van kuće.

Koordinacioni server te mreže je **Headscale** (otvorena implementacija
Tailscale kontrolnog servera). Klijenti su obični Tailscale klijenti.

**Šta od ovoga postoji danas:** samo izdavanje ključa za ulazak u mrežu
(backend). Hub kao izlazna tačka (exit node / subnet router) i ekran u
aplikaciji koji to pokreće — ne postoje. Vidi odjeljak 7.

---

## 2. Infrastruktura

- Dokploy, projekat „Fornect Sentinel", Compose servis `headscale`
  (App Name `fornect-sentinel-headscale-zqxavk`). Napravljen od nule
  12.09.2026. **[eLab 12.09.]**
- Tri kontejnera, svi dijele volume `/opt/netguard-headscale/{config,data,run}`
  **[eLab 12.09.]**:
  - `headscale-init` (alpine) — piše `config.yaml` i izlazi,
  - `headscale` (`headscale/headscale:0.28.0`) — server, healthcheck
    `headscale nodes list`,
  - `headscale-cli` — pomoćni kontejner za `headscale` komande; čeka da
    server bude zdrav.
- Domen `https://headscale.lukmandavran.cc` (Let's Encrypt). `/health`
  vraća `{"status":"pass"}`. **[eLab 12.09.]**
- Ključne stavke iz `config.yaml` (vidljive u Compose fajlu u Dokploy-u):
  - `policy.mode: database` — bez ovoga ACL se ne može mijenjati preko API-ja,
  - `unix_socket: /var/run/headscale/headscale.sock` — dijeli ga i CLI kontejner,
  - adrese: `100.64.0.0/10` i `fd7a:115c:a1e0::/48`,
  - ugrađeni DERP server je **isključen**; koristi se javna DERP mapa
    Tailscale-a (`controlplane.tailscale.com/derpmap/default`).

**Napomena o DERP-u:** kad dva uređaja ne mogu direktno uspostaviti vezu,
saobraćaj ide preko Tailscale-ovih relay servera. Sadržaj je i dalje
šifrovan WireGuard-om s kraja na kraj, ali metapodaci (ko s kim, koliko)
prolaze kroz treću stranu. Za proizvod koji se prodaje kao privatnost —
odluku o vlastitom DERP serveru treba donijeti svjesno. **[nije odlučeno]**

---

## 3. Izolacija između naloga

Headscale **po defaultu dozvoljava sav saobraćaj između svih uređaja svih
korisnika.** Zato je 12.09. preko `PUT /api/v1/policy` postavljena globalna
politika `autogroup:self`: uređaji istog Headscale korisnika vide se
međusobno, tuđi ne. **[eLab 12.09.]**

Izolacija dakle **ne zavisi od koda backenda** — zavisi od te jedne
politike na serveru. Ako se Headscale ikad ponovo napravi od nule (kao
12.09.), politika se mora ponovo postaviti PRIJE nego ijedan pravi nalog
dobije ključ.

Stanje politike danas nije ponovo pročitano. **[nije provjereno 25.09.]**

---

## 4. Mapiranje nalog → Headscale korisnik

- **Jedan Headscale korisnik po Fornect nalogu**, ne po hubu. Nalog sa više
  hubova (Pro/Agency) ima jednog korisnika, i sva njegova oprema je u istoj
  mreži. **[kod]**
- Ime: `fornect-` + prvih 20 heks znakova UUID-a naloga (bez crtica).
  `ensureHeadscaleUser` je idempotentan — prvo traži po imenu, pa tek onda
  pravi. **[kod]**
- Tabele (migracija 020) **[kod]**:
  - `vpn_accounts` — `account_id` → `headscale_user_id`, `headscale_user_name`,
  - `vpn_preauth_key_events` — ko je, kad i za šta (`hub` / `phone`) tražio
    ključ. **Sam ključ se ne čuva.**

Headscale korisnik `admin-devices` (id 1) nije Fornect nalog — to je
administrativni/testni korisnik pod kojim je registrovan `pc-von-lukman`.
**[eLab 12.09. / 17.09.]**

---

## 5. Tok izdavanja ključa

```
aplikacija ── POST /api/v1/app/vpn/preauth-key  { "purpose": "hub" | "phone" }
              (JWT naloga, kao sve /api/v1/app/* rute)
   │
   ├─ ensureHeadscaleUser(accountId)        GET /api/v1/user?name=...  → POST /api/v1/user
   ├─ INSERT vpn_accounts ... ON CONFLICT DO NOTHING
   ├─ createPreAuthKey(userId)              POST /api/v1/preauthkey
   │     reusable: false, ephemeral: false
   │     rok: hub 30 min, telefon 15 min
   ├─ INSERT vpn_preauth_key_events
   └─ 200 { key, login_server, expires_at }

uređaj ── tailscale up --login-server=<login_server> --authkey=<key>
```

- Ključ je **jednokratan** — svaki uređaj traži svoj. **[kod]**
- Nije `ephemeral` — čvor ne nestaje iz mreže čim telefon ugasi VPN. **[kod]**
- Ograničenje: 20 zahtjeva na sat (po IP-u, podrazumijevani ključ
  `@fastify/rate-limit`). **[kod]**
- Greške **[kod]**: `400` pogrešan `purpose`; `503` Headscale nije
  konfigurisan; `502` Headscale ne odgovara ili vrati grešku.
- Ruta postoji na produkciji: bez tokena vraća `401`, a nepostojeća ruta
  pod istim prefiksom `404`. **[provjereno 25.09.]**

---

## 6. Konfiguracija backenda

| Varijabla | Obavezna | Značenje |
|---|---|---|
| `HEADSCALE_URL` | ne | npr. `https://headscale.lukmandavran.cc` |
| `HEADSCALE_API_KEY` | ne | Bearer ključ za Headscale REST API |

Namjerno **nisu** obavezne: bez njih VPN ruta vraća `503`, a ostatak
servera radi normalno. Pravilo iz crash-loopa od 10.09. — nova vanjska
integracija ne smije oboriti postojeći backend. **[kod]**

Na produkciji su postavljene 12.09. **[eLab 12.09.]**

API ključ se pravi jednom, na Headscale strani (`headscale apikeys create`),
ne po nalogu. Ne upisuje se u repozitorij ni u razgovore.

---

## 7. Šta NE postoji / nije provjereno

Poredano po tome koliko blokira stvarnu upotrebu.

1. **Niko nije prošao cijeli tok sa pravim nalogom.** Ruta postoji, ali
   poziv sa pravim JWT-om → Headscale → ključ → `tailscale up` nije
   isproban. **[nije provjereno]**
2. **Oblik odgovora Headscale 0.28 API-ja** (lista korisnika po imenu,
   polje `user` kao numerički ID pri pravljenju ključa) potvrđen je iz
   proto definicija, ne pozivom na živi server. **[nije provjereno]**
3. **Hub kao izlazna tačka ne postoji.** Agent na uređaju (Zadatak 2) ne
   postoji, pa niko ne oglašava exit node / rute. **[kod]**
4. **Politika vjerovatno ne dozvoljava izlaz na internet preko huba.**
   `autogroup:self` otvara saobraćaj između uređaja istog korisnika; za
   korištenje exit node-a Tailscale model traži i pravilo prema
   `autogroup:internet`. Da li ga Headscale 0.28 podržava i u kom obliku —
   provjeriti prije nego se gradi hub strana. **[nije provjereno]**
5. **Odobravanje ruta.** U Headscale-u oglašene rute (exit node, subnet)
   moraju se odobriti ručno ili kroz `autoApprovers` u politici. Nije
   riješeno. **[nije provjereno]**
6. **Brisanje naloga ne čisti Headscale.** `vpn_accounts` se briše
   kaskadno, ali Headscale korisnik i njegovi čvorovi ostaju u mreži.
   Treba poziv za brisanje korisnika/čvorova pri brisanju naloga. **[kod]**
7. **Uklanjanje uređaja iz aplikacije ne izbacuje ga iz VPN-a.** Nema
   rute koja briše čvor. **[kod]**
8. **Aplikacija ne zove VPN rutu.** Kartica „Zaštita izvan kuće"
   (`features/protection/away-card`) je samo tekst; nijedan ekran ne
   poziva `/vpn/preauth-key`. **[kod]**
9. `orangepizero` nije ponovo registrovan na novi server (izgubljen
   pristup). Nije bitno — privremeni test uređaj. **[eLab 17.09.]**

---

## 8. Operativne lekcije (iz dnevnika)

- CLI/pomoćni kontejner mora dijeliti **unix socket** volume sa serverom,
  ne samo config/data — inače `context deadline exceeded`. **[eLab 12.09.]**
- `policy.mode: database` mora biti postavljen prije prvog
  `PUT /api/v1/policy`; sa `file` API odbija izmjenu. **[eLab 12.09.]**
- Docker Compose ne rekreira kontejner čija se definicija nije promijenila,
  čak i kad je fajl koji čita (preko volumena) prepisan — treba ručni
  Restart. **[eLab 12.09.]**
- Dokploy „Open Terminal" ne radi na `headscale` image-u (nema shell) —
  za CLI komande ide se SSH-om na host. **[eLab 17.09.]**
- `headscale preauthkeys create` u ovoj verziji traži **numerički**
  `--user` ID, ne ime. **[eLab 17.09.]**
- Istekao ključ: provjeriti polje `Used`. „Istekao, nekorišten" znači da
  se uređaj nikad nije spojio; „korišten pa istekao" je normalno.
  **[eLab 17.09.]**
