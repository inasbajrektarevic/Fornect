-- Zapis pristanka na presretanje saobraćaja (puna zaštita / MITM).
--
-- Zašto zaseban zapis, a ne još nekoliko kolona na network_devices:
-- pristanak nije trenutno stanje uređaja nego pravni dokument. Mora
-- se vidjeti KO ga je dao, KADA, na koju VERZIJU politike i kojim
-- putem. Zato je ovo trajni trag — svako davanje i svaki opoziv je
-- novi red, ništa se ne prepisuje.
--
-- mac_address i device_name se namjerno prepisuju ovdje umjesto da se
-- čitaju iz network_devices: ako se uređaj kasnije obriše iz panela,
-- zapis pristanka mora ostati čitljiv. Zato je veza ON DELETE SET NULL,
-- a ne CASCADE — brisanje uređaja ne smije uništiti dokaz pristanka,
-- što je kod uređaja maloljetnika neprihvatljivo.
--
-- Polja prate spisak iz Zadatka 1, Oblast F (dokaz pristanka).

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  network_device_id uuid REFERENCES network_devices(id) ON DELETE SET NULL,

  -- Snimljeno u trenutku pristanka, ne čita se naknadno.
  mac_address text NOT NULL,
  device_name text NOT NULL,

  -- Ko daje pristanak. Za uređaj maloljetnika to je staratelj, a ne
  -- korisnik uređaja — zato relacija mora biti zapisana.
  guardian_name text NOT NULL,
  guardian_relation text NOT NULL,
  subject_is_minor boolean NOT NULL DEFAULT false,

  -- Verzija politike koju je korisnik prihvatio. Kad izađe nova,
  -- uređaji sa starom verzijom traže ponovno prihvatanje.
  policy_version text NOT NULL,

  -- Kako je pristanak dat: kroz captive portal na samom uređaju,
  -- kroz admin panel, automatski (auto-guest politika za IoT), ili
  -- ručnom potvrdom kad tehnička provjera nije prošla.
  method text NOT NULL CHECK (method IN ('portal', 'panel', 'auto', 'manual')),

  -- Otisak CA certifikata prikazan korisniku pri instalaciji, da se
  -- kasnije može dokazati KOJI certifikat je prihvaćen.
  ca_fingerprint text,

  granted_at timestamptz NOT NULL DEFAULT now(),

  -- Popunjava se tek kad uređaj tehnički dokaže da vjeruje našem CA
  -- (uspješan TLS handshake kroz Squid). Do tada je pristanak
  -- deklarativan — korisnik je rekao da je instalirao, ali nije
  -- dokazano. Razlika je bitna i pravno i tehnički.
  verified_at timestamptz,
  verification_failed_at timestamptz,
  verification_error text,

  revoked_at timestamptz,
  revoked_reason text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_records_account_id_idx ON consent_records (account_id);
CREATE INDEX consent_records_network_device_id_idx ON consent_records (network_device_id);
CREATE INDEX consent_records_mac_idx ON consent_records (account_id, mac_address);

-- Jedan uređaj smije imati najviše jedan aktivan (neopozvan) pristanak.
-- Istorijski zapisi ostaju netaknuti, ali dva istovremeno važeća
-- pristanka za isti uređaj nemaju smisla i sakrila bi grešku u toku.
CREATE UNIQUE INDEX consent_records_one_active_per_device_idx
  ON consent_records (network_device_id)
  WHERE revoked_at IS NULL AND network_device_id IS NOT NULL;
