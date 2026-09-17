-- Obavještenja se sele sa uređaja na server.
--
-- Do sada su živjela u localStorage-u pregledača. To je značilo tri
-- stvari koje su rušile samu svrhu funkcije:
--   1. obavještenje je nastajalo tek kada bi neko otvorio aplikaciju,
--      pa roditelj koji je noću ne otvara nije dobio ništa;
--   2. isti nalog je na telefonu i na webu imao različite liste;
--   3. brisanje podataka pregledača je brisalo i dokaz da se nešto
--      desilo.
--
-- Obavještenje o odlasku sa mreže u vrijeme rasporeda nije stanje nego
-- DOGAĐAJ: desio se u 23:12 i to što se uređaj vratio u 07:00 ne čini
-- ga nepostojećim. Zato ostaje zapisano sa svojim vremenom, a ne
-- nestaje kad stanje prođe.

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- ON DELETE SET NULL, a ime uređaja je denormalizovano u `params`:
  -- brisanje uređaja ne smije obrisati zapis da je te noći napustio
  -- mrežu. Isti razlog kao kod consent_records.
  network_device_id uuid REFERENCES network_devices(id) ON DELETE SET NULL,

  type text NOT NULL
    CHECK (type IN ('offline', 'update', 'protection', 'capacity')),

  -- Ključevi prijevoda, ne gotov tekst: isti zapis se prikazuje na
  -- jeziku koji je korisnik izabrao u trenutku čitanja, a ne na onom
  -- koji je bio aktivan u trenutku nastanka.
  title_key text NOT NULL,
  message_key text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Sprječava da isto obavještenje nastane dva puta. NULL znači
  -- "ovo se smije ponoviti".
  dedupe_key text,

  read_at timestamptz,

  -- Obavještenja koja opisuju STANJE (dostignut kapacitet, uređaj
  -- trenutno van mreže) nestaju kada stanje prođe, ali ne brisanjem
  -- nego ovako — da ostane trag da su postojala.
  resolved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jedno aktivno obavještenje po ključu. Kada se riješi, isti ključ
-- smije nastati ponovo (npr. sljedeće noći).
CREATE UNIQUE INDEX notifications_active_dedupe_idx
  ON notifications (account_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX notifications_account_created_idx
  ON notifications (account_id, created_at DESC);

-- Vremenska zona naloga.
--
-- Server računa da li je uređaj nestao sa mreže "u vrijeme rasporeda".
-- Bez ovoga bi taj račun radio po vremenu servera: produkcija je u
-- UTC-u, porodica u Sarajevu, pa bi odlazak u 21:30 po lokalnom
-- vremenu server vidio kao 19:30 i zaključio da raspored (21:00-07:00)
-- još nije počeo. Obavještenje bi bilo tačno po satu, a pogrešno po
-- smislu.
--
-- Podrazumijevana vrijednost pokriva postojeće naloge; nova je šalju
-- pri registraciji iz pregledača.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Sarajevo';
