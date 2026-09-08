# Fornect Admin Panel — web i mobilna aplikacija

Admin panel kroz koji krajnji korisnik (roditelj, vlasnik objekta)
upravlja svojim Fornect uređajem — bez terminala, MAC adresa i
config fajlova.

Ovo je **Zadatak 3** POC faze projekta Fornect / NGTF.

---

## Šta aplikacija radi

- **Pregled uređaja na mreži** — bez ručnog unosa MAC adresa
- **Profil uređaja jednim klikom** — Dijete / Teen / Adult / Admin
- **Vremenska ograničenja (bedtime)** — birač vremena, po danima
- **Emergency override** — privremeno dozvoljavanje interneta
  (15 min / 30 min / 1 sat / do kraja dana)
- **Uparivanje certifikata** kroz aplikaciju, sa tri nivoa zaštite:
  isključeno / standardna (DNS) / puna (MITM, traži certifikat)
- **Status uređaja** — online/offline i verzija softvera
- **Restrikcije sadržaja** po profilu, sa mogućnošću izmjene
- **Praćenje prisutnosti** — obavijest kada uređaj napusti mrežu,
  sa drugačijom porukom ako se to desi usred rasporeda spavanja
- **Pro modovi** — Hospitality (ugostiteljstvo) i Agency (agencije)
- **Dva jezika** — bosanski i engleski

---

## Preduslovi

| Alat | Verzija | Za šta |
|---|---|---|
| Node.js | 20+ | web aplikacija |
| npm | 11+ | paketi |
| JDK | **21** | Android build (obavezno 21, ne stariji) |
| Android Studio | novija | Android SDK, emulator |

---

## Web aplikacija

```bash
npm install
npm start
```

Otvoriti `http://localhost:4200/`.

Produkcijski build:

```bash
npm run build
```

Rezultat ide u `dist/fornect-admin-web/browser`.

---

## Testovi

End-to-end testovi (Playwright, 21 test):

```bash
npx playwright install    # samo prvi put
npm run test:e2e
```

Playwright sam podiže dev server ako već ne radi.

---

## Android aplikacija

Aplikacija je Angular web build umotan u [Capacitor](https://capacitorjs.com/).
Nema odvojenog koda za Android — isti izvorni kod ide i na web i na telefon.

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

Zatim ili kroz Android Studio (otvoriti folder `android`, pa
**Run 'app'**), ili iz komandne linije:

```bash
cd android
./gradlew assembleDebug           # Windows: .\gradlew assembleDebug
```

APK se pravi u `android/app/build/outputs/apk/debug/app-debug.apk`.

Instalacija na emulator ili telefon:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.fornect.admin/.MainActivity
```

> `adb` je u `<Android SDK>/platform-tools/`. Ako komanda nije
> prepoznata, koristiti punu putanju do `adb`.

---

## Struktura projekta

```
src/app/
├── core/
│   ├── services/     stanje aplikacije (auth, device, hub,
│   │                 notification, schedule, language)
│   ├── guards/       zaštita ruta
│   └── pipes/        translate pipe
└── features/         ekrani (dashboard, devices, device-details,
                      protection, schedule, notifications,
                      settings, pro-*, ...)
android/              Capacitor Android projekat (generisan)
tests/                Playwright e2e testovi
```

---

## Stanje podataka — važno

U POC fazi **nema backend-a**: sve stanje (nalozi, uređaji,
profili, rasporedi, obavještenja) čuva se u `localStorage`
browsera, odvojeno po nalogu.

Aplikacija je namjerno strukturirana tako da je povezivanje na
pravi API kontrolisana izmjena: sve ide kroz servise u
`src/app/core/services/`, pa se mijenja samo njihova unutrašnjost
(čitanje i pisanje podataka), dok komponente i UI ostaju netaknuti.

Poznato ograničenje: obavještenje o uređaju koji je napustio mrežu
računa se kada je aplikacija otvorena. Za obavještenje u realnom
vremenu (dok je aplikacija zatvorena) potreban je server koji prati
heartbeat uređaja i šalje push — to je van opsega POC faze.

---

## Tehnološke odluke

- **Angular 22** (standalone komponente + signali) — signali daju
  reaktivno stanje bez dodatne biblioteke za state management,
  a standalone komponente uklanjaju NgModule sloj.
- **Capacitor** umjesto zasebne mobilne aplikacije — isti kod za
  web i mobilni, jedna baza koda za održavanje, a POC traži i web
  i mobilnu verziju u istom roku.
- **Vlastiti i18n** (bs/en) umjesto biblioteke — samo dva jezika,
  bez potrebe za dodatnom zavisnošću; parnost ključeva se provjerava.
- **localStorage** u POC fazi — backend (Fastify Admin API) je
  odvojen zadatak; ovako je UI mogao biti završen i demonstriran
  nezavisno od njega.
- **Playwright** za e2e — testira stvarno ponašanje u browseru,
  uključujući mobilne širine i veličinu dodirnih meta.

---

## Deploy (produkcija)

Frontend se deployuje kao nginx-servirana statička slika (root
`Dockerfile`), odvojeno od backend servisa (`server/Dockerfile`).
Detalji, dva razmatrana pristupa i preporuka — vidi
[`deploy/README.md`](deploy/README.md).
