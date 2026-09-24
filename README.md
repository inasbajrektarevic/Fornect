# Fornect Admin Panel — web, mobilna aplikacija i backend

Admin panel kroz koji krajnji korisnik (roditelj, vlasnik objekta)
upravlja svojim Fornect uređajem — bez terminala, MAC adresa i
config fajlova.

Ovo je **Zadatak 3** POC faze projekta Fornect / NGTF. Tehnička osnova
za ono što panel smije tvrditi i kako razgovara sa uređajem je
**Zadatak 1** (Alen Vrbanjac).

---

## Šta je gdje

| Folder | Šta je | Ko ga koristi |
|---|---|---|
| `src/` | Angular aplikacija — **ista i za web i za mobilni**. | korisnik, u pregledaču ili na telefonu |
| `android/` | Capacitor omotač oko `src/`. **Nema svog koda za ekrane.** | build za Android |
| `server/` | Backend: Fastify + TypeScript + PostgreSQL, migracije, API. Vidi [`server/README.md`](server/README.md). | panel, mobilna aplikacija, Fornect uređaj |
| `portal/` | Captive portal — stranica pristanka koju servira **sam Fornect uređaj**, ne ovaj server. Vidi [`portal/README.md`](portal/README.md). | gost ili novi uređaj na mreži |
| `docs/` | Kontrakti sa uređajem: šta cloud šalje, šta uređaj mora uraditi. | onaj ko piše agenta na uređaju (`fornectd`) |
| `deploy/` | nginx i uputstvo za produkciju. Vidi [`deploy/README.md`](deploy/README.md). | deploy |
| `tests/` | Playwright e2e testovi, protiv pravog backenda. | razvoj |

**Web i mobilni nemaju odvojen kod.** Svaki ekran iz `src/` je automatski
i u Android aplikaciji. Posebnog foldera za mobilni kod nema, i to je
namjerno (vidi *Tehnološke odluke*).

---

## Šta aplikacija radi

**Home**

- Pregled uređaja na mreži i red „Novi uređaji" za one o kojima još niko
  nije odlučio
- Profil uređaja jednim klikom — Dijete / Teen / Adult / Admin, sa
  ograničenjima sadržaja po profilu
- Raspored spavanja po danima i hitni izuzetak
- Tri nivoa zaštite — isključeno / standardna (DNS) / puna (traži
  certifikat), uz **iskreno navedene brojke**: oko 64% / 70–85% / nikad 100%
- Pristanak na presretanje: forma, zapis, dokaz certifikata, opoziv, i
  ponovno prihvatanje kad se politika promijeni
- Obavještenja na serveru — odlazak sa mreže, nov uređaj, pali pristanak,
  pun kapacitet, pristanak na staru verziju politike

**Pro**

- Hospitality i Agency vid, kapacitet licence i ekran „kapacitet pun"
- Tekst i brend captive portala

**Za sve naloge**

- Fleet / OTA: prsten ažuriranja, prozor održavanja, zaustavljanje
  ažuriranja, set filter lista sa vraćanjem prethodnog, grupne komande
- Dva jezika — bosanski i engleski

---

## Pokretanje za razvoj

Potrebna su **tri** procesa: baza, backend i panel. Panel bez backenda
samo prikazuje ekran prijave.

### 1. Baza i backend

```bash
cd server
npm install
cp .env.example .env   # popuniti DATABASE_URL, JWT_SECRET, ADMIN_API_KEY
npm run migrate        # primijeni migracije; bezbjedno pokrenuti više puta
npm run dev            # http://localhost:3000
```

Za lokalni rad u `server/.env` podići i ova dva limita (objašnjenje je u
`.env.example`), inače testovi prolaze jednom na sat:

```
DEVICE_REGISTER_MAX_PER_HOUR=1000
HUB_CLAIM_MAX_PER_HOUR=1000
```

`server/.env` **ne ide u git** — u njemu su lozinka baze i ključevi.

### 2. Panel

```bash
npm install
npm start              # http://localhost:4200, /api ide na backend
```

### 3. Captive portal (po potrebi)

```bash
npm run portal         # http://localhost:4300, glumi uređaj
```

---

## Testovi

58 e2e testa: 42 za panel (`tests/fornect.spec.ts`) i 16 za portal
(`tests/portal.spec.ts`).

**Backend mora biti pokrenut** (korak 1 gore). Panel i portal Playwright
podiže sam.

```bash
npx playwright install    # samo prvi put
npx playwright test
```

Prije commita, i provjera tipova na serveru — backend se pokreće kroz
`tsx`, koji tipove **ne provjerava**, pa zeleni testovi to ne garantuju:

```bash
cd server
npm run typecheck
```

Tekstovi portala se ne prepisuju ručno nego generišu iz panela, jer
panel i portal korisniku moraju reći istu stvar o dometu zaštite:

```bash
npm run portal:texts:check
```

---

## Android aplikacija

Aplikacija je isti Angular build umotan u [Capacitor](https://capacitorjs.com/).

### Na koji backend ide aplikacija — pročitati prije builda

Android aplikacija razgovara sa **produkcijskim** backendom
(`https://admin.lukmandavran.cc/api/v1`), a pregledač sa onim na istoj
adresi kao panel. Izbor pravi `src/app/core/config/api.config.ts`, po tome
da li kod radi u aplikaciji ili u pregledaču.

Dvije posljedice koje treba znati:

- **Aplikacija vidi ono što je deployano, ne tvoj lokalni kod.** Nove
  funkcije proradiće na telefonu tek kad se backend sa njihovim
  migracijama deployuje. Dok produkcija nema migracije 008–019, novi
  panel u aplikaciji razgovara sa starim backendom: najviše što se može
  očekivati je prijava postojećim nalogom (nije provjereno), a
  registracija, pristanak, obavještenja, portal i Fleet ne.
- **Za probu protiv lokalnog backenda** privremeno promijeni adresu u
  `api.config.ts` na `http://<IP računara>:3000/api/v1` — i tada Android
  traži dozvolu za običan `http` (samo debug build). Tu izmjenu ne
  commitovati.

Poznato ograničenje: „Preuzmi certifikat" pravi fajl u pregledaču, a
WebView na Androidu takvo preuzimanje ne snima bez dodatnog plugina.
Certifikat se ionako instalira na uređaj koji se štiti, najčešće kroz
captive portal, a ne na telefon roditelja.

### Podešavanje JDK-a (uraditi jednom)

Capacitor 8 kompajlira za **Javu 21**. Ako je `java` na PATH-u
stariji, build pada sa `invalid source release: 21`.

Putanja do JDK-a **nije** upisana u `android/gradle.properties`,
jer je različita na svakom računaru. Podesiti kod sebe, na jedan
od dva načina:

**Opcija 1 — `JAVA_HOME`** da pokazuje na JDK 21.

**Opcija 2 — korisnički Gradle fajl** (ne dira se projekat):

```
# Windows: C:\Users\<ime>\.gradle\gradle.properties
org.gradle.java.home=C:/Program Files/Android/Android Studio/jbr
```

Android Studio nosi svoj JDK 21 u `jbr` podfolderu, pa je to
najlakši izvor ako JDK nije zasebno instaliran.

### Build i pokretanje

```bash
npm run build                    # 1. Angular build
npx cap sync android             # 2. prebaci web u Android projekat
```

Korak 2 se mora ponoviti poslije svake izmjene u `src/` — kopija weba u
`android/` nije u gitu, pa aplikacija ima onoliko koliko je bilo pri
posljednjem syncu.

Zatim ili kroz Android Studio (otvoriti folder `android`, pa
**Run 'app'**), ili iz komandne linije:

```bash
cd android
./gradlew assembleDebug           # Windows: .\gradlew assembleDebug
```

APK se pravi u `android/app/build/outputs/apk/debug/app-debug.apk`.

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.fornect.admin/.MainActivity
```

> `adb` je u `<Android SDK>/platform-tools/`.

---

## Struktura `src/`

```
src/app/
├── core/
│   ├── config/       adresa API-ja
│   ├── services/     sav razgovor sa backendom (auth, device, hub,
│   │                 consent, notification, portal-settings, fleet,
│   │                 language...)
│   ├── interceptors/ dodaje prijavu (JWT) na svaki poziv API-ja
│   └── guards/       zaštita ruta
├── shared/           translate pipe, zajedničke komponente
└── features/         ekrani — jedan folder po ekranu
```

Komponente ne zovu API direktno — sve ide kroz servise u `core/services/`.

---

## Tehnološke odluke

- **Angular 22** (standalone komponente + signali, bez zone.js) — signali
  daju reaktivno stanje bez dodatne biblioteke. Posljedica: polje koje se
  mijenja asinhrono, a nije signal, traži `markForCheck()`.
- **Capacitor** umjesto zasebne mobilne aplikacije — isti kod za web i
  mobilni, jedna baza koda za održavanje.
- **Vlastiti i18n** (bs/en) — samo dva jezika; parnost ključeva se
  provjerava, a tekstovi portala se generišu iz panela.
- **Playwright** za e2e — testira stvarno ponašanje u pregledaču, protiv
  pravog backenda i baze, uključujući mobilne širine.

---

## Deploy (produkcija)

Frontend se deployuje kao nginx-servirana statička slika (root
`Dockerfile`), odvojeno od backend servisa (`server/Dockerfile`).
Detalji — vidi [`deploy/README.md`](deploy/README.md).
