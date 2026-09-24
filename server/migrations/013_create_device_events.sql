-- Evidencija eventa koje hub šalje ka cloud-u.
--
-- Kontrakt iz Zadatka 1, Tačka 5: device.new, device.classified,
-- consent.revoked, consent.verify_failed. To je ulaz za red "Novi
-- uređaji" i za zapis pristanka — do sada ih je punio isključivo
-- panel, pa je hub mogao vidjeti uređaj a da to nigdje ne stigne.
--
-- Zašto tabela, a ne samo obrada u ruti: hub šalje preko mreže koja
-- pada. Takav kanal je "bar jednom", ne "tačno jednom" — uređaj koji
-- ne dobije odgovor mora smjeti ponoviti isti paket. Bez zapisa šta je
-- već obrađeno, ponovljeni `consent.revoked` bi opozvao pristanak koji
-- je korisnik u međuvremenu ponovo dao.
--
-- `event_id` dodjeljuje uređaj. Jedinstven je po uređaju, ne globalno:
-- dva huba smiju nezavisno brojati svoje evente.

CREATE TABLE device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,

  -- Identifikator koji je dao uređaj. Po njemu se prepoznaje ponavljanje.
  event_id text NOT NULL,

  type text NOT NULL
    CHECK (type IN ('device.new', 'device.classified', 'consent.revoked',
                    'consent.verify_failed')),

  mac_address text NOT NULL,

  -- Cijeli paket kako je stigao. Čuva se i kad je obrada uspjela:
  -- kad se kasnije ispostavi da je neko stanje pogrešno, ovo je jedini
  -- zapis šta je uređaj zaista rekao.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Zašto event nije primijenjen, ako nije. NULL znači da jeste.
  rejected_reason text,

  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX device_events_device_event_idx
  ON device_events (device_id, event_id);

CREATE INDEX device_events_device_received_idx
  ON device_events (device_id, received_at DESC);
