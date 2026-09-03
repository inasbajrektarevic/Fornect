-- Korisnički nalozi (roditelji/admin app korisnici), odvojeno od
-- fizičkih Fornect uređaja. Jedan account može biti uparen sa jednim
-- ili više network_devices (preko account_id), koji zauzvrat mogu
-- biti povezani sa fizičkim hub-om (devices) preko fornect_device_id.

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
