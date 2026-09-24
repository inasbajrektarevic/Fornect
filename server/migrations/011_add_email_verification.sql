-- Prava verifikacija email adrese.
--
-- Do sada je `email_verified` postojao ali ga niko nije postavljao:
-- kod je bio zakucan u frontendu (123456), server o verifikaciji nije
-- znao nista. Svako je mogao "potvrditi" tudju adresu.
--
-- Cuva se HASH koda, ne sam kod. Za razliku od pairing koda uredjaja
-- (migracija 007), koji hub mora moci prikazati pa se drzi u citljivom
-- obliku, ovaj kod se nikad ne cita nazad — samo se poredi. Kad se
-- porediti moze i preko hasha, nema razloga drzati ga u citljivom
-- obliku u bazi.
--
-- `verification_attempts` postoji jer sest cifara ima svega milion
-- kombinacija: bez ogranicenja broja pokusaja kod se pogodi grubom
-- silom i prije nego istekne.
--
-- `verification_sent_at` sluzi da se ponovno slanje ne moze zloupotrebiti
-- za zasipanje tudjeg inboxa.

ALTER TABLE accounts
  ADD COLUMN verification_code_hash text,
  ADD COLUMN verification_code_expires_at timestamptz,
  ADD COLUMN verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN verification_sent_at timestamptz;
