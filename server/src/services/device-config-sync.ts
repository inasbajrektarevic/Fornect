// Automatska sinhronizacija consented_macs configa.
//
// Kad se pairing_state nekog network_device-a promijeni u/iz 'paired',
// pišemo NOVI red u device_configs (uvećana verzija) čiji config_json
// sadrži sve MAC adrese tog naloga koje su trenutno uparene SA ISTIM
// fizičkim hub-om (fornect_device_id). Orange Pi agent ovo povlači
// kroz GET /api/v1/devices/:id/config i upisuje u nftables set
// 'consented_macs'.
//
// Namjerno se ne agregira preko CIJELOG naloga bez obzira na hub:
// Pro/agency nalozi mogu imati network_devices uparene sa različitim
// fizičkim hub-ovima (npr. više lokacija), pa bi slanje tuđih MAC
// adresa pogrešnom hub-u bilo curenje podataka. Za uobičajeni Home
// slučaj (jedan nalog = jedan hub) ovo se svodi na isto ponašanje
// koje je opisano u zadatku.

import type { PoolClient } from 'pg';

export async function syncConsentedMacs(
  client: PoolClient,
  accountId: string,
  fornectDeviceId: string | null,
): Promise<void> {
  // Nema uparenog fizičkog hub-a za ovaj network_device — nema kome
  // pisati config, pa nema šta sinhronizovati.
  if (!fornectDeviceId) {
    return;
  }

  const { rows: pairedRows } = await client.query<{ mac_address: string }>(
    `SELECT mac_address
     FROM network_devices
     WHERE account_id = $1
       AND fornect_device_id = $2
       AND pairing_state = 'paired'
     ORDER BY mac_address`,
    [accountId, fornectDeviceId],
  );

  const consentedMacs = pairedRows.map((row) => row.mac_address);

  const { rows: versionRows } = await client.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM device_configs
     WHERE device_id = $1`,
    [fornectDeviceId],
  );

  const nextVersion = versionRows[0]?.next_version ?? 1;

  await client.query(
    `INSERT INTO device_configs (device_id, version, config_json)
     VALUES ($1, $2, $3::jsonb)`,
    [fornectDeviceId, nextVersion, JSON.stringify({ consented_macs: consentedMacs })],
  );
}
