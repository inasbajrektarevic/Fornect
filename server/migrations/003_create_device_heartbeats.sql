-- Log heartbeat-ova koje uređaj šalje svakih 5 min. Čuvamo historiju
-- (payload sa statistikom) radi dijagnostike; trenutni status uređaja
-- se drži denormalizovano na devices.status / devices.last_seen_at.

CREATE TABLE device_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_heartbeats_device_id_created_at_idx
  ON device_heartbeats (device_id, created_at DESC);
