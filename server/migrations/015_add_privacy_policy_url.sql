-- Veza ka politici privatnosti, koju portal prikazuje uz formu pristanka.
--
-- Zadatak 1, pravni sloj: "politika privatnosti u kutiji/portalu".
-- GDPR traži da bude dostupna u trenutku kad se pristanak daje, a ne
-- negdje kasnije — pristanak dat bez uvida u to šta se sa podacima radi
-- nije informisan pristanak.
--
-- Prazno znači da veza nije podešena. Tada se ne prikazuje ništa, jer
-- mrtva veza na ekranu pristanka je gora od nikakve: izgleda kao da je
-- politika ponuđena, a nije.
ALTER TABLE portal_settings
  ADD COLUMN IF NOT EXISTS privacy_policy_url text NOT NULL DEFAULT '';
