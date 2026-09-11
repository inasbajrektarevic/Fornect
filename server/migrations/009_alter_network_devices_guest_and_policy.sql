-- Dvije dopune koje traži tok pristanka iz Zadatka 1 (Tačka 5).
--
-- 1) Stanje 'guest'.
--    Do sada je 'unpaired' značilo dvije različite stvari: "niko još
--    nije odlučio za ovaj uređaj" i "vlasnik je svjesno izabrao samo
--    osnovnu zaštitu". Uređaju na mreži je ta razlika bitna:
--    neklasifikovan uređaj dobija poziv kroz captive portal, a gost
--    ne dobija ništa. Bez razdvajanja bi gost pri svakom povezivanju
--    ponovo dobijao "Prijavi se na mrežu", što je upravo ono što
--    Tačka 5 pokušava izbjeći.
--
-- 2) policy_version.
--    Kad izađe nova verzija politike pristanka, uređaji koji su
--    prihvatili stariju moraju je ponovo prihvatiti. Bez zapisa koja
--    je verzija prihvaćena, to se ne može ni znati ni dokazati.
--    Kolona dozvoljava NULL jer uređaji zavedeni prije ove migracije
--    nemaju prihvaćenu verziju — a lažna vrijednost bi bila gora od
--    prazne.

ALTER TABLE network_devices
  DROP CONSTRAINT IF EXISTS network_devices_pairing_state_check;

ALTER TABLE network_devices
  ADD CONSTRAINT network_devices_pairing_state_check
  CHECK (pairing_state IN ('unpaired', 'guest', 'pairing', 'paired', 'failed'));

ALTER TABLE network_devices
  ADD COLUMN IF NOT EXISTS policy_version text;
