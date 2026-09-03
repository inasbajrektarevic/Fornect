-- Fornect fizički uređaji (Orange Pi / RK3568 hub-ovi).
-- token_hash je sha256 hex otisak Bearer tokena koji uređaj dobije
-- prilikom registracije — sam token se nikad ne čuva u bazi.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
