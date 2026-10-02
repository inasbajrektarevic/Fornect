-- Zaštita od prevara (V1): hub javlja kada je blokirao domenu sa liste
-- poznatih prevara/phishinga (fornectd v0.7, event threat.blocked).
--
-- Do sada je blokada bila nevidljiva: Pi-hole je odbio lažnu stranicu
-- banke, a roditelj o tome nije znao ništa. Upravo to "javili smo vam
-- da smo zaustavili prevaru" je ono što gradi povjerenje u uređaj.
--
-- Obavještenje je DOGAĐAJ, ne stanje: desilo se, ostaje zapisano.
-- Ponavljanje sprječava dedupe_key po (uređaj, domena, dan) — jedna
-- lažna stranica napravi desetine upita, a roditelj treba jednu poruku.

ALTER TABLE device_events DROP CONSTRAINT IF EXISTS device_events_type_check;
ALTER TABLE device_events
  ADD CONSTRAINT device_events_type_check
  CHECK (type IN ('device.new', 'device.classified', 'consent.revoked',
                  'consent.verified', 'consent.verify_failed',
                  'threat.blocked'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('offline', 'update', 'protection', 'capacity',
                  'new-device', 'consent', 'threat'));
