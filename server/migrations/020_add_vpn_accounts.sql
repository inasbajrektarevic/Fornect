-- VPN roaming zaštita (Headscale): mapiranje Fornect naloga na
-- Headscale "user" (tailnet identitet). Jedan headscale user PO
-- NALOGU (ne po hub-u) — Pro/Agency nalog sa više hub-ova ima jedan
-- headscale user, sva njegova oprema (hub-ovi + telefoni) je u istom
-- tailnet-u i smije međusobno komunicirati.
--
-- IZOLACIJA od drugih naloga se NE postiže ovom tabelom nego
-- globalnom Headscale ACL politikom (autogroup:self grant), postavljenom
-- JEDNOM za cijeli server — vidi docs/VPN_HEADSCALE_ARHITEKTURA.md.
-- Bez te politike Headscale po defaultu dozvoljava SAV saobraćaj
-- između SVIH korisnika (potvrđeno u zvaničnoj dokumentaciji), pa je
-- postavljanje politike preduslov prije nego ijedan pravi nalog dobije
-- pre-auth ključ.

CREATE TABLE vpn_accounts (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  headscale_user_id bigint NOT NULL,
  headscale_user_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit trag izdatih pre-auth ključeva. NE čuvamo sam ključ (Headscale
-- ga već čuva bcrypt-hashovanog) — samo ko/kada/za šta je tražio
-- uparivanje, radi dijagnostike i budućeg rate-limitinga po nalogu.
CREATE TABLE vpn_preauth_key_events (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('hub', 'phone')),
  headscale_key_id bigint,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vpn_preauth_key_events_account_idx
  ON vpn_preauth_key_events (account_id, created_at DESC);
