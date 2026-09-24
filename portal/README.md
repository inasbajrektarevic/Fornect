# Captive portal (portal UI bundle)

Zadatak 1, Tačka 5. Ovo je statički paket koji **servira sam Fornect
uređaj** (`fornectd`) uređaju koji se tek pojavio na mreži. Nije dio
Angular aplikacije i ne gradi se — kopira se na data particiju uređaja
i ažurira OTA, nezavisno od OS image-a.

```
portal/
  index.html        svi ekrani, prebacuju se u JS-u
  portal.css
  portal.js
  texts.json        GENERISANO — ne mijenjati rukom
  config.json       tekst i brend; ovo puni editor iz stavke 1.2
  build-texts.js    generiše texts.json iz panela
  dev-server.js     glumi fornectd, da se portal može otvoriti već sada
```

## Pokretanje

```
npm run portal            → http://localhost:4300
npm run test:e2e          → uključuje i portal testove (tests/portal.spec.ts)
```

`npm run test:e2e` sam diže i panel (4200) i portal (4300).

## Zašto bez framework-a i bez ijednog vanjskog resursa

Klijent koji gleda ovu stranicu **je iza captive portala i nema
internet**. Svaki vanjski zahtjev — CDN, web font, analitika — visio bi
dok ne istekne, a stranica bi se prikazala napola ili nikako.

Na iPhone-u ovo otvara Captive Network Assistant, mali WebView sa svojim
ograničenjima; na Androidu ugrađeni preglednik. Što manje pokretnih
dijelova, to manje načina da ne proradi baš na uređaju koji treba
zaštititi.

## Tekstovi: šta se dijeli sa panelom, a šta ne

`texts.json` se **generiše** iz `src/app/core/services/language.ts`:

```
npm run portal:texts          osvježi
npm run portal:texts:check    padne ako nije osvježen  ← ovo ide u CI
```

Dijele se brojke o dometu zaštite i uputstvo za instalaciju certifikata.
Razlog nije udobnost: portal i panel su dvije isporuke koje korisniku
govore istu stvar, i ako se raziđu, jedna tvrdi nešto što druga ne
tvrdi. Zadatak 1, Oblast C to vezuje za njemački UWG i dokazivost
marketinške tvrdnje. Prepisati tekst rukom na dva mjesta znači čekati da
se raziđu.

**Peti korak uputstva se namjerno NE dijeli.** U panelu glasi „vratite
se ovdje i potvrdite da je profil instaliran", jer tamo postoji dugme i
čovjek koji za tu tvrdnju odgovara. Na portalu tog dugmeta nema.

## Lokalni API koji portal očekuje od uređaja

Iz Lukmanovog kontrakta:

| Metoda | Ruta | Šta radi |
|---|---|---|
| POST | `/v1/devices/{mac}/classify` | `{state: guest\|consented, consent:{...}, method: portal\|manual}` |
| POST | `/v1/consent/{mac}/revoke` | „prebaci na osnovnu" iz portala |

Jedna napomena uz `classify`: pristanak (`consent`) je uslov da se **uđe**
u tok. Uređaj koji je već u `verifying` ga je dao ranije, pa ga potvrda
instalacije (`method: manual`) ne šalje ponovo.

**Dodano, nije u kontraktu — treba javiti Lukmanu:**

| Metoda | Ruta | Šta radi |
|---|---|---|
| GET | `/v1/portal/session` | ko je klijent i u kakvom je stanju |
| GET | `/v1/portal/ca.crt` | javni CA certifikat uređaja |

`/v1/portal/session` vraća:

```json
{
  "mac": "02:00:00:00:ab:cd",
  "device_name": "Testni telefon",
  "state": "unknown",
  "policy_version": "1.0",
  "accepted_policy_version": null,
  "ca_fingerprint": "AB:CD:…",
  "ca_url": "/v1/portal/ca.crt",
  "capacity_full": false,
  "check_url": "https://check.fornect.local/ok",
  "check_timeout_ms": 90000,
  "language": "bs"
}
```

Portal ne može sam znati svoju MAC adresu — zna je uređaj, iz DHCP/ARP
tabele. Zato `session` mora postojati. `check_timeout_ms` daje uređaj
jer on zna koliko njegov Squid treba.

### Stanja i kako se dokazuje da certifikat radi

Rječnik je iz kontrakta: `unknown → (guest | verifying → consented)`.
Portal po njemu bira gdje korisnik ulazi u tok — uređaj koji je već
odlučio se ne pita ponovo, a onaj usred instalacije nastavlja gdje je
stao, bez ponovnog potpisivanja.

`check_url` je HTTPS adresa koju **Squid bump-uje** i koja vraća 204.
Portal je otvori; ako pregledač zaista vjeruje našem CA, TLS handshake
prođe. **Handshake vidi sam uređaj**, pa on promoviše MAC u `consented`
i piše audit zapis — portal zatim samo gleda svoje stanje dok se ne
promijeni.

Zahtjev ide sa `fetch(..., {mode: 'no-cors'})`, jer endpoint vraća 204
bez CORS zaglavlja: odgovor se ne može pročitati, ali to i ne treba —
bitno je samo je li handshake prošao. Stariji WebView bez `fetch`-a pada
na učitavanje slike. Adresa nosi `?t=` da preglednik ne posluži prvi
neuspjeh iz keša.

**Ispravljeno dva puta, vrijedi zapisati obje greške.** Prvo sam napravio
`GET /v1/portal/check` na kojem *uređaj* kaže da li je handshake prošao
— preko običnog HTTP-a, što o TLS-u ne dokazuje ništa. Onda sam to
zamijenio učitavanjem slike i slanjem ishoda uređaju — što je značilo da
o dokazu presuđuje strana koja ga ne vidi, a i ne bi radilo jer endpoint
vraća 204 (slike nema). Tek ovo treće prati kontrakt.

### Ručna potvrda kao fallback

Ako automatska provjera ne prođe u predviđenom vremenu, portal nudi
„Instalirao sam certifikat" — kontrakt je predviđa uz oznaku
`method=manual` u audit logu. Dugme se pojavljuje **tek tada**: da stoji
od početka, niko ne bi čekao dokaz, a zapis bi izgledao dokazano a ne bi
bio. Ispod dugmeta piše da se takav pristanak vodi kao izjavljen.

### Izmijenjena politika

Kad `accepted_policy_version` zaostaje za `policy_version`, portal traži
da korisnik ponovo odluči, uz banner koji kaže zašto. Pristanak vrijedi
za tekst na koji je dat, ne zauvijek.

### Portal ide preko HTTP-a, ne HTTPS-a

Namjerno: gosti nemaju naš CA, pa bi im HTTPS portal dao upozorenje o
certifikatu prije nego što uopšte vide o čemu odlučuju.

## Šta ovdje NIJE gotovo

- **Provjera certifikata radi samo kad Squid MITM radi**, dakle na
  pravom hardveru (Zadatak 2). Do tada je glumi `dev-server.js`.
- **OTA isporuka bundle-a na uređaj** nije odlučena (Lukmanova sekcija 2).
- **Ništa od ovoga nije isprobano protiv pravog uređaja.** Testovi
  dokazuju da portal radi ono što treba *kad uređaj odgovori* — ne da
  uređaj odgovara.

Spisak onoga što je lažno u razvojnom serveru stoji u komentaru na vrhu
`dev-server.js`.

## Odluke koje izgledaju kao propust, a nisu

**Nema dugmeta „instalirao sam certifikat".** U panelu takvo dugme
postoji i zapis se označi kao `manual`, jer tamo stoji čovjek koji za
tvrdnju odgovara. Ovdje ne stoji niko. Dugme koje bi preskočilo provjeru
pravilo bi pristanak koji izgleda dokazano a nije — a to je tačno ono
što je u panelu već jednom popravljano.

**Ekran sa uputstvom se ne mijenja dok provjera traje.** Korisnik u tom
trenutku drži telefon u postavkama i čita korake. Da mu se stranica
prebaci na „provjeravam", izgubio bi uputstvo usred posla.

**Pristanak bez imena i odnosa davaoca se ne šalje.** Prazan potpis je
gori od nikakvog, jer u zapisu izgleda kao dokaz.
