-- Uređaji na kućnoj/poslovnoj mreži koje account upravlja kroz
-- admin app (telefoni, TV-ovi, konzole...). Ne miješati sa `devices`
-- tabelom, koja predstavlja sam Fornect hub.
--
-- fornect_device_id kaže kojim fizičkim hub-om je uređaj uparen —
-- ON DELETE SET NULL jer gubitak hub-a ne treba obrisati korisnikova
-- podešavanja (profil, restrikcije, raspored) za taj uređaj.

CREATE TABLE network_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fornect_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  mac_address text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'unknown'
    CHECK (type IN ('phone', 'tv', 'console', 'unknown')),
  profile text
    CHECK (profile IS NULL OR profile IN ('Child', 'Teen', 'Adult', 'Admin')),
  protection_level text NOT NULL DEFAULT 'needs-setup'
    CHECK (protection_level IN ('standard', 'full', 'needs-setup')),
  pairing_state text NOT NULL DEFAULT 'unpaired'
    CHECK (pairing_state IN ('unpaired', 'pairing', 'paired', 'failed')),
  use_full_protection boolean NOT NULL DEFAULT false,
  online boolean NOT NULL DEFAULT false,
  blocked_ads_today integer NOT NULL DEFAULT 0,
  override_until timestamptz,
  restrictions jsonb,
  alert_when_offline boolean,
  schedule jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, mac_address)
);

CREATE INDEX network_devices_account_id_idx ON network_devices (account_id);
CREATE INDEX network_devices_fornect_device_id_idx ON network_devices (fornect_device_id);
