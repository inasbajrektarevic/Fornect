# Fleet / OTA — šta panel radi, a šta traži od uređaja

Zadatak 3 (admin platforma) za Zadatak 1 (Alen) i Zadatak 2 (agent na uređaju).

Osnova: Zadatak 1, Tačka 6, tačka 5 — „Cloud/panel dobija *Fleet / OTA* modul.
Bez ovog modula OTA u produkciji ne kreće."

---

## 1. Šta je gotovo na cloud strani

Sve ide kroz **postojeći** config kanal — `GET /api/v1/devices/:id/config`,
verzionisan i sa potvrdom (`POST /devices/:id/config/ack`). Nije uveden nijedan
novi kanal ka uređaju.

`config_json` je od sada **potpun objekat**, ne samo `consented_macs`:

```json
{
  "consented_macs": ["aa:bb:cc:00:11:22"],
  "ota": {
    "ring": "bench | early | half | all",
    "paused": false,
    "maintenance_window": {
      "start": "02:00",
      "end": "04:00",
      "timezone": "Europe/Sarajevo"
    }
  },
  "filter_lists": {
    "set_id": "uuid ili null",
    "label": "HaGeZi Pro 2026-09-18",
    "urls": ["https://..."]
  }
}
```

Napomene koje nisu kozmetičke:

- **Uzmite cijeli objekat, ne spajajte ga sa starim.** Cloud ga uvijek šalje
  potpunog. Isti config se ne upisuje dvaput, pa porast `version` znači da se
  nešto stvarno promijenilo.
- **`maintenance_window.timezone` ide uz prozor** namjerno. „02:00 lokalno" bez
  zone je poziv da se update pokrene u podne.
- **`filter_lists.urls: []` znači „panel nema šta reći o listama"**, pa uređaj
  ostaje na svom ugrađenom setu. Ne znači „ugasi filtriranje". Zaštita se ne
  gasi praznim poljem.
- Prozor **smije prelaziti ponoć** (23:00–03:00). Ne pretpostavljajte
  `start < end`.
- **MAC adrese su uvijek u obliku `aa:bb:cc:dd:ee:ff`** — mala slova,
  dvotačke. Cloud ih tako normalizuje na svakom ulazu i baza drugi oblik ne
  prima (migracija 019). Isti oblik očekujemo i u eventima i u prijavi
  prisutnosti; poređenje osjetljivo na velika slova bi uređaj učinilo
  nevidljivim.
- `ring` je oznaka prstena, ne procenat. Koliko je „early" procenata flote je
  odluka rolloutu i živi u cloudu, ne u uređaju.

Panel ekran: `/fleet` (iz Postavki). Po hub-u: inventar verzija, prsten,
prozor održavanja, kill-switch, set lista i vraćanje prethodnog seta.

Grupne komande (`POST /api/v1/app/fleet/bulk`), kad nalog ima više hub-ova.
Grupa je jedan prsten ili cijeli nalog:

- **pauza / nastavak** — isto `ota.paused` za svaki uređaj u grupi
- **poništavanje seta lista** — NIJE „vrati prethodni svima". Poništava se
  izabrani set, i to samo na uređajima na kojima je trenutno aktivan.
  Uređaj sa drugim setom se preskače: loša lista ne stigne uvijek do cijele
  grupe, a „prethodni" na uređaju koji je nije dobio poništio bi dobru
  izmjenu.

Za uređaj se ništa ne mijenja — grupna komanda završi kao isti `ota` i
`filter_lists` blok u configu svakog pogođenog uređaja.

---

## 2. Šta tražimo od uređaja

### 2.1 Verzije u heartbeat-u (traži se sada)

`POST /api/v1/devices/:id/heartbeat` prima novo, neobavezno polje:

```json
{ "stats": {}, "versions": { "fornectd": "0.4.1", "pihole": "6.0.2",
                             "squid": "6.10", "portal_bundle": "12" } }
```

Slobodan oblik ključ→verzija, jer se skup komponenti mijenja. Heartbeat **bez**
tog polja ne briše ranije prijavljene verzije.

Dok ovo ne počne stizati, panel piše „uređaj ne prijavljuje verzije". Ne
prikazuje prazno polje koje izgleda uredno.

### 2.2 Zdravstveni podaci (traži se prije nego health dashboard ima smisla)

Tačka 6 traži health dashboard: stopa blokiranja, Squid error rate,
boot-counter. **Taj ekran nije napravljen i neće biti dok ovi podaci ne stižu.**
Ekran koji ih crta iz ničega prikazivao bi nule koje se ne razlikuju od stvarnih
nula, a na osnovu takvog broja neko donese odluku o rolloutu.

Predlog polja u `stats`, otvoren za izmjenu:

```json
{
  "dns": { "queries_24h": 0, "blocked_24h": 0 },
  "squid": { "requests_24h": 0, "errors_24h": 0 },
  "boot": { "counter": 0, "last_boot_at": "ISO 8601" },
  "update": { "last_result": "ok | rollback | failed", "at": "ISO 8601" }
}
```

Bitno je da `blocked_24h` i `queries_24h` dolaze **oba**, jer canary prsten iz
Tačke 2.1 pazi na *odstupanje stope* od baseline-a, a stopa se ne može izvesti
iz samog broja blokiranih.

### 2.3 Šta uređaj treba da radi sa `ota`

- Ne dirati ništa izvan prozora održavanja.
- `paused: true` → ne preuzimati i ne instalirati ništa novo; zatečeno stanje
  ostaje kakvo jeste.
- Rezultat pokušaja prijaviti kao event (postoji `POST /devices/:id/events`,
  idempotentan po `event_id`) — tip za OTA ishod još nije dogovoren.

### 2.4 Veličina lista prije učitavanja

Cloud na Home uređaju odbija HaGeZi Ultimate i TIF (Zadatak 1, Oblast C i
Tačka 1: ~1,8–2 GB samo za liste, a uređaj ima 2 GB). Ali cloud listu
prepoznaje **po imenu u adresi** — ista lista pod drugim imenom bi prošla.

Zato uređaj prije `updateGravity` treba sam provjeriti broj domena, i ako
prelazi granicu za svoju memoriju (orijentaciono ~300k na 2 GB, po Tački 1),
**zadržati staru listu** i javiti to kao event. Gravity swap ionako čuva staru
bazu dok nova nije gotova, pa je ovo isti dobar ishod kao kod prekinutog
downloada: nikad prazna zaštita, i nikad oboren Pi-hole.

---

## 3. Šta ostaje van dometa Zadatka 3

Ovo su odluke i poslovi koji nisu u panelu:

- **Mirror lista** (`lists.fornect.*`) sa jitterom. Panel upisuje URL-ove i
  upozorava kad pokazuju na direktan izvor (`raw.githubusercontent.com` i
  slično), ali sam mirror ne postoji i nije naš posao.
- **Canary automatika** — automatska pauza rolloutu na skok stope blokiranja.
  Panel ima ručni kill-switch; automatika traži podatke iz 2.2.
- **RAUC A/B, dm-verity, secure boot, U-Boot bootcount, watchdog, recovery
  servis** — sve na uređaju.
- **Code-signing CA** za potpisane artefakte. Odvojen od MITM user-CA i od
  Ed25519 licence iz Tačke 4 (higijena ključeva). Gdje ti ključevi žive je
  odluka koja čeka, ista kao za licencu.

---

## 4. Otvoreno pitanje nazad prema Tački 6

Prstenovi su u panelu vezani **za uređaj**. Tačka 6 ih opisuje kao prstenove
flote (bench → 5% → 50% → 100%). Za POC je isto, jer se prsten postavlja ručno.
Za hiljade uređaja neko mora birati *koji* uređaji čine tih 5% — to je posao
cloud-a, ne panela, i nije napravljeno.
