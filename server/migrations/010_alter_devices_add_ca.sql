-- Javni dio CA certifikata kojim hub potpisuje presretnuti saobraćaj.
--
-- Privatni ključ NIKADA ne dolazi ovdje. Generiše ga i drži sam hub,
-- a cloud čuva samo javni certifikat i njegov otisak — toliko je
-- dovoljno da ga panel prikaže korisniku i ponudi na preuzimanje.
--
-- Razlog nije formalnost. Ko ima privatni ključ CA certifikata, može
-- se lažno predstaviti kao bilo koja web stranica svakom uređaju koji
-- taj certifikat ima instaliran. Da ključevi žive u cloudu, jedan
-- proboj servera kompromitovao bi sve kupce odjednom. Ovako proboj
-- jednog uređaja pogađa samo tog kupca.
--
-- Kolone dozvoljavaju NULL jer hub prijavljuje svoj CA tek nakon
-- registracije — do tada ga panel nema šta prikazati, i to mora
-- otvoreno reći umjesto da izmisli vrijednost.

ALTER TABLE devices
  ADD COLUMN ca_certificate_pem text,
  ADD COLUMN ca_fingerprint_sha256 text,
  ADD COLUMN ca_registered_at timestamptz;
