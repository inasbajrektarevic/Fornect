-- Verzionisane konfiguracije koje uređaj povlači kroz
-- GET /api/v1/devices/:id/config i potvrđuje kroz config/ack.
-- Svaka promjena upisuje NOVI red (append-only), nikad UPDATE
-- postojećeg config_json-a, da bi historija ostala vidljiva.

CREATE TABLE device_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  acked_at timestamptz,
  UNIQUE (device_id, version)
);

CREATE INDEX device_configs_device_id_version_idx
  ON device_configs (device_id, version DESC);
