-- Tekst i brend captive portala, po nalogu.
--
-- Zadatak 1, stavka 1.2: izmjena teksta portala bez diranja koda.
-- Portal je statički paket na uređaju (vidi portal/), a ovdje se čuva
-- ono što se u njemu mijenja.
--
-- Do sada je ovo postojalo samo u hospitality ekranu panela i živjelo u
-- localStorage-u pregledača: korisnik unese tekst, vidi "sačuvano", a na
-- uređaj ne ode ništa. Tekst koji nikad ne stigne do portala nije
-- podešavanje nego privid.
--
-- Po NALOGU, ne po hub-u: Home korisnik ima jedan hub i pitanje "koji
-- uređaj uređuješ" bi mu samo smetalo. Ako agencija sa više lokacija
-- bude tražila različit brend po lokaciji, to je migracija koja dodaje
-- fornect_device_id i pravilo "vrijednost hub-a ima prednost".

CREATE TABLE portal_settings (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,

  brand_name text NOT NULL DEFAULT 'Fornect',

  -- Hex boja naglaska. Ograničenje je namjerno strogo: ovo završi u
  -- CSS-u na uređaju, pa proizvoljan string ovdje znači proizvoljan
  -- sadržaj u stilu portala.
  accent_color text NOT NULL DEFAULT '#f5821f'
    CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),

  -- Po jeziku, jer portal govori jezikom gosta, a ne jezikom vlasnika.
  welcome_title_bs text NOT NULL DEFAULT 'Dobrodošli na zaštićenu mrežu',
  welcome_title_en text NOT NULL DEFAULT 'Welcome to a protected network',

  welcome_message_bs text NOT NULL DEFAULT
    'Ova mreža filtrira reklame i praćenje. Izaberite kako želite da se vaš uređaj štiti.',
  welcome_message_en text NOT NULL DEFAULT
    'This network filters ads and tracking. Choose how you want your device protected.',

  -- Prazno znači "ne prikazuj kontakt".
  support_contact text NOT NULL DEFAULT '',

  -- Raste na svaki snimak. Uređaj kešira bundle i po ovome jeftino
  -- pita "je li se promijenilo" umjesto da povlači cijeli paket.
  version integer NOT NULL DEFAULT 1,

  updated_at timestamptz NOT NULL DEFAULT now()
);

-- NAPOMENA o tome šta se ovdje NE smije podešavati:
--
-- Brojke o dometu zaštite, granice tih brojki i uputstvo za instalaciju
-- certifikata nisu ovdje i neće biti. To su tvrdnje za koje Fornect
-- odgovara pred zakonom (Zadatak 1, Oblast C — njemački UWG), a ne
-- tekst koji vlasnik mreže mijenja po volji. One dolaze iz panela kroz
-- portal/build-texts.js i isti su za sve.
