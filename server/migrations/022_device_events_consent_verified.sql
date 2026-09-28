-- Hub potvrđuje instalaciju certifikata (fornectd v0.3): kad u Squid
-- logu vidi dekriptovan zahtjev klijenta ka provjernoj adresi, šalje
-- event consent.verified. Do sada je potvrdu mogao dati samo čovjek u
-- panelu, pa uređaj nije imao kako da tehnički dokazani pristanak
-- prijavi oblaku.
ALTER TABLE device_events DROP CONSTRAINT IF EXISTS device_events_type_check;
ALTER TABLE device_events
  ADD CONSTRAINT device_events_type_check
  CHECK (type IN ('device.new', 'device.classified', 'consent.revoked',
                  'consent.verified', 'consent.verify_failed'));
