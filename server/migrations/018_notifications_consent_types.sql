-- Dva nova tipa obavještenja, oba o pristanku.
--
-- Rupa koju zatvaraju: hub zna da se pojavio nepoznat uređaj
-- (`device.new`) i zna kad instalacija certifikata nije uspjela
-- (`consent.verify_failed`). Oboje se uredno upisivalo u red „Novi
-- uređaji" — ali vlasnik za to sazna samo ako sam otvori taj ekran.
--
-- Za odlazak sa mreže i za pun kapacitet obavještenje postoji. Da za
-- pristanak ne postoji bila je moja nedosljednost, ne odluka: čovjek
-- koji je usred instalacije odustao je upravo onaj kome treba javiti.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('offline', 'update', 'protection', 'capacity', 'new-device', 'consent'));
