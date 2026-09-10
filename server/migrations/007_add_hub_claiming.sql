-- Pravo uparivanje fizičkog Fornect uređaja (hub) sa nalogom, preko
-- kratkog pairing koda koji uređaj generiše/prikazuje. Zamjenjuje
-- dosadašnji (nesiguran) put preko network_devices.fornect_device_id,
-- koji je dozvoljavao bilo kom nalogu da proizvoljno postavi tuđi
-- device UUID bez ikakve provjere vlasništva.

ALTER TABLE devices
  ADD COLUMN claimed_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN pairing_code text,
  ADD COLUMN pairing_code_expires_at timestamptz;

-- Napomena: NAMJERNO nema unique indeksa na claimed_by_account_id —
-- jedan account (Pro/Agency) smije imati više hub-ova. Svaki uređaj i
-- dalje može biti uparen sa najviše jednim nalogom (obična kolona).

-- Kod mora biti jedinstven dok je aktivan (nedodijeljen uređaju čiji
-- kod je istekao/iskorišten se prepisuje sa NULL, pa partial index
-- pokriva samo trenutno "žive" kodove).
CREATE UNIQUE INDEX devices_pairing_code_idx
  ON devices (pairing_code)
  WHERE pairing_code IS NOT NULL;
