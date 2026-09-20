-- Zadatak 1, Tačka 6, tačka 5: „Fleet / OTA" modul u admin platformi.
--
-- Ovdje stoji SAMO ono o čemu odlučuje cloud, a uređaj izvršava:
-- prsten rolloutu, pauza (kill-switch) i prozor održavanja. Sve troje
-- putuje ka uređaju kroz postojeći device_configs kanal.
--
-- Zdravstveni podaci (stopa blokiranja, Squid error rate, boot-counter)
-- NAMJERNO nisu ovdje: njih uređaj prijavljuje, a danas ih ne šalje.
-- Prazna kolona koju niko ne puni je obećanje koje panel ne može
-- održati, pa se ne pravi dok kontrakt heartbeat-a ne bude dopunjen.

ALTER TABLE devices
  -- Prstenovi iz Tačke 6: bench → 5% → 50% → 100%. Uređaj se stavlja u
  -- prsten ovdje; koliko je to procenata flote je odluka rolloutu, ne
  -- osobina uređaja, pa se procenti ne upisuju u bazu.
  ADD COLUMN IF NOT EXISTS ota_ring text NOT NULL DEFAULT 'all'
    CHECK (ota_ring IN ('bench', 'early', 'half', 'all')),

  -- Kill-switch. Pauzira se po uređaju; pauza cijele flote je pauza
  -- svakog uređaja, a ne zaseban globalni prekidač — tako pauza
  -- preživi i ako neki uređaj u tom trenutku nije bio na vezi.
  ADD COLUMN IF NOT EXISTS ota_paused boolean NOT NULL DEFAULT false,

  -- Prozor održavanja. Alenov prijedlog defaulta je 02:00–04:00 po
  -- lokalnom vremenu. Vrijeme se čuva kao `time`, a koje je to lokalno
  -- vrijeme govori accounts.timezone — ista kolona koju obavještenja
  -- već koriste da bi znala kad je „noć".
  ADD COLUMN IF NOT EXISTS maintenance_start time NOT NULL DEFAULT '02:00',
  ADD COLUMN IF NOT EXISTS maintenance_end time NOT NULL DEFAULT '04:00';

-- Verzije koje uređaj prijavljuje. Ovo je denormalizacija posljednjeg
-- heartbeat-a radi liste flote: bez nje bi inventar verzija za svaki
-- uređaj kopao po device_heartbeats.payload.
--
-- Ostaje NULL dok uređaj ne počne slati `versions` u heartbeat-u. Panel
-- tada piše „uređaj ne prijavljuje verzije", a ne izmišljenu verziju.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS reported_versions jsonb,
  ADD COLUMN IF NOT EXISTS reported_versions_at timestamptz;
