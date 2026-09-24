-- Jedan oblik MAC adrese u network_devices: `aa:bb:cc:dd:ee:ff`.
--
-- Greška koju ovo zatvara (detaljno u server/src/services/mac.ts):
-- panel je upisivao MAC onako kako ga je korisnik otkucao, hub ga je
-- slao malim slovima, a baza ih je poredila kao stringove. Uređaj
-- dodan velikim slovima bio je za hub nevidljiv, a kad bi ga hub javio
-- kao nov, nastao bi drugi red za isti fizički uređaj.
--
-- Tri koraka, i prva dva mogu zaustaviti migraciju. To je namjerno.

DO $$
DECLARE
  collisions text;
  invalid text;
BEGIN
  -- 1) Isti uređaj u dva oblika na istom nalogu.
  --
  -- NE spaja se automatski. Spajanje znači odlučiti koji red preživi —
  -- a uz svaki red mogu stajati pristanak, raspored, historija
  -- obavještenja i mjesto u licenci. To je odluka za čovjeka koji zna
  -- šta je koji red, ne za migraciju koja bi to uradila tiho i
  -- nepovratno.
  SELECT string_agg(
           format('nalog %s: %s', account_id, macs), E'\n'
         )
    INTO collisions
    FROM (
      SELECT account_id,
             string_agg(mac_address || ' (' || id || ')', ', ') AS macs
        FROM network_devices
       GROUP BY account_id, lower(replace(trim(mac_address), '-', ':'))
      HAVING count(*) > 1
    ) dup;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION E'Isti uređaj je zaveden više puta u različitom obliku MAC adrese.\n'
                    'Obrišite višak ručno pa ponovo pokrenite migraciju:\n%', collisions;
  END IF;

  -- 2) Nešto što ni poslije normalizacije nije MAC adresa.
  SELECT string_agg(format('%s (%s)', mac_address, id), E'\n')
    INTO invalid
    FROM network_devices
   WHERE lower(replace(trim(mac_address), '-', ':'))
         !~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$';

  IF invalid IS NOT NULL THEN
    RAISE EXCEPTION E'Ovi zapisi nemaju ispravnu MAC adresu i ne mogu se normalizovati:\n%',
                    invalid;
  END IF;
END
$$;

-- 3) Normalizacija, pa ograničenje koje ne da da se ovo vrati.
--
-- Ograničenje je važnije od same normalizacije: ruta koju neko doda
-- sutra i zaboravi pozvati normaliseMac() ne upiše pogrešan oblik
-- tiho, nego padne odmah i glasno.
UPDATE network_devices
   SET mac_address = lower(replace(trim(mac_address), '-', ':'))
 WHERE mac_address <> lower(replace(trim(mac_address), '-', ':'));

ALTER TABLE network_devices
  DROP CONSTRAINT IF EXISTS network_devices_mac_address_format;

ALTER TABLE network_devices
  ADD CONSTRAINT network_devices_mac_address_format
  CHECK (mac_address ~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$');

-- consent_records.mac_address se NAMJERNO ne dira.
--
-- To je trag revizije: bilježi šta je stajalo u trenutku pristanka, i
-- ne prepisuje se naknadno, ni kad je izmjena samo u obliku zapisa.
-- Niko ga ne traži po MAC adresi (veza ide preko network_device_id),
-- pa razlika u obliku tamo ništa ne kvari.
