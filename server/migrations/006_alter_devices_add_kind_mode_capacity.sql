-- Fornect Home vs. Fornect Pro razlika: kind ('home'|'pro') i
-- softverski mod ('home'|'hospitality'|'agency'), plus kapacitet
-- (maks. broj network_devices koje hub podržava u Pro modu).

ALTER TABLE devices
  ADD COLUMN kind text NOT NULL DEFAULT 'home' CHECK (kind IN ('home', 'pro')),
  ADD COLUMN mode text NOT NULL DEFAULT 'home' CHECK (mode IN ('home', 'hospitality', 'agency')),
  ADD COLUMN capacity integer;
