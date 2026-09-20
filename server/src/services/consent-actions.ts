// Radnje nad pristankom: davanje, provjera, opoziv.
//
// Do sada su živjele unutar ruta panela. Izdvojene su jer isto to
// sada radi i hub, kroz evente koje šalje (device.classified,
// consent.revoked, consent.verify_failed — vidi routes/device-events.ts).
// Dva puta do istog ishoda smiju postojati; dva različita zapisa o
// istom pristanku ne smiju, pa pravila stoje na jednom mjestu.
//
// Funkcije ne znaju ništa o HTTP-u: primaju otvorenu transakciju i
// vraćaju ishod. Ko ih zove odlučuje koji je to status kod i da li
// commit-uje.

import type { PoolClient } from 'pg';

import { CONSENT_POLICY_VERSION } from './consent-policy';
import { syncDeviceConfig } from './device-config-sync';

import { recordConsentFailure, resolveConsentFailure } from './notifications';

export interface ConsentRecordRow {
  id: string;
  account_id: string;
  network_device_id: string | null;
  mac_address: string;
  device_name: string;
  guardian_name: string;
  guardian_relation: string;
  subject_is_minor: boolean;
  policy_version: string;
  method: 'portal' | 'panel' | 'auto' | 'manual';
  ca_fingerprint: string | null;
  granted_at: string;
  verified_at: string | null;
  verification_failed_at: string | null;
  verification_error: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

export interface ConsentDeviceRow {
  id: string;
  account_id: string;
  fornect_device_id: string | null;
  mac_address: string;
  name: string;
  pairing_state: 'unpaired' | 'guest' | 'pairing' | 'paired' | 'failed';
}

export type ConsentResult =
  | { ok: true; record: ConsentRecordRow }
  | { ok: false; code: number; error: string };

export const CONSENT_DEVICE_COLUMNS =
  'id, account_id, fornect_device_id, mac_address, name, pairing_state';

export async function loadDeviceForUpdate(
  client: PoolClient,
  deviceId: string,
  accountId: string,
): Promise<ConsentDeviceRow | undefined> {
  const { rows } = await client.query<ConsentDeviceRow>(
    `SELECT ${CONSENT_DEVICE_COLUMNS}
     FROM network_devices
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [deviceId, accountId],
  );

  return rows[0];
}

export async function loadActiveConsent(
  client: PoolClient,
  deviceId: string,
): Promise<ConsentRecordRow | undefined> {
  const { rows } = await client.query<ConsentRecordRow>(
    `SELECT * FROM consent_records
     WHERE network_device_id = $1 AND revoked_at IS NULL`,
    [deviceId],
  );

  return rows[0];
}

async function reload(client: PoolClient, id: string): Promise<ConsentRecordRow> {
  const { rows } = await client.query<ConsentRecordRow>(
    'SELECT * FROM consent_records WHERE id = $1',
    [id],
  );

  return rows[0]!;
}

export interface GrantInput {
  guardianName: string;
  guardianRelation: string;
  subjectIsMinor?: boolean;
  method?: ConsentRecordRow['method'];
  caFingerprint?: string | null;
}

/** Korak 1 — pristanak je dat, ali još nije dokazan. */
export async function grantConsent(
  client: PoolClient,
  device: ConsentDeviceRow,
  input: GrantInput,
): Promise<ConsentResult> {
  const guardianName = input.guardianName?.trim();
  const guardianRelation = input.guardianRelation?.trim();

  // Bez ovoga zapis ne vrijedi kao dokaz pristanka, pa ga ne primamo
  // ni kao nepotpun — prazan potpis je gori od nikakvog.
  if (!guardianName || !guardianRelation) {
    return { ok: false, code: 400, error: 'guardian_name i guardian_relation su obavezni.' };
  }

  const active = await loadActiveConsent(client, device.id);

  if (active) {
    // Isti uređaj, ista verzija politike — nema šta da se ponovo
    // prihvata.
    if (active.policy_version === CONSENT_POLICY_VERSION) {
      return { ok: false, code: 409, error: 'Za ovaj uređaj već postoji važeći pristanak.' };
    }

    // Starija verzija politike — stari pristanak se zatvara sa jasnim
    // razlogom umjesto da se tiho prepiše, da se u tragu vidi zašto je
    // prestao važiti.
    await client.query(
      `UPDATE consent_records
       SET revoked_at = now(), revoked_reason = $2
       WHERE id = $1`,
      [active.id, `Zamijenjen novom verzijom politike (${CONSENT_POLICY_VERSION}).`],
    );
  }

  const { rows } = await client.query<ConsentRecordRow>(
    `INSERT INTO consent_records (
       account_id, network_device_id, mac_address, device_name,
       guardian_name, guardian_relation, subject_is_minor,
       policy_version, method, ca_fingerprint
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      device.account_id,
      device.id,
      device.mac_address,
      device.name,
      guardianName,
      guardianRelation,
      input.subjectIsMinor ?? false,
      CONSENT_POLICY_VERSION,
      input.method ?? 'panel',
      input.caFingerprint ?? null,
    ],
  );

  // Uređaj ulazi u 'pairing': korisnik je pristao, ali još nije
  // dokazao da certifikat radi. Puna zaštita se NE uključuje ovdje —
  // tek nakon uspješne provjere.
  await client.query(
    `UPDATE network_devices
     SET pairing_state = 'pairing',
         use_full_protection = true,
         policy_version = $2
     WHERE id = $1`,
    [device.id, CONSENT_POLICY_VERSION],
  );

  // Ako je uređaj do sada bio 'paired', izlazak iz tog stanja mora se
  // odraziti na consented_macs.
  if (device.pairing_state === 'paired') {
    await syncDeviceConfig(client, device.account_id, device.fornect_device_id);
  }

  return { ok: true, record: rows[0]! };
}

export interface VerifyInput {
  success: boolean;
  error?: string;
  /**
   * Potvrda je došla od čovjeka ("instalirao sam"), a ne od uređaja
   * koji je tehnički dokazao handshake. Tačka 5 traži da se takva
   * potvrda u tragu označi kao `manual`, da se kasnije zna koji su
   * pristanci dokazani a koji samo izjavljeni.
   */
  manual?: boolean;
}

/** Korak 3 — rezultat tehničke provjere certifikata. */
export async function verifyConsent(
  client: PoolClient,
  device: ConsentDeviceRow,
  input: VerifyInput,
): Promise<ConsentResult> {
  const active = await loadActiveConsent(client, device.id);

  // Provjera bez pristanka nema smisla — znači da je neko preskočio
  // korak 1 ili da je pristanak u međuvremenu opozvan.
  if (!active) {
    return {
      ok: false,
      code: 409,
      error: 'Za ovaj uređaj ne postoji pristanak koji se provjerava.',
    };
  }

  if (input.success) {
    // Ručna potvrda se upisuje kao 'manual' da bi se u reviziji
    // razlikovao dokazan pristanak od izjavljenog. Potvrda koja stiže
    // od uređaja ne dira method — ostaje kako je pristanak i dat.
    await client.query(
      `UPDATE consent_records
       SET verified_at = now(),
           verification_failed_at = NULL,
           verification_error = NULL,
           method = CASE WHEN $2 THEN 'manual' ELSE method END
       WHERE id = $1`,
      [active.id, input.manual === true],
    );

    await client.query(
      `UPDATE network_devices
       SET pairing_state = 'paired', protection_level = 'full'
       WHERE id = $1`,
      [device.id],
    );

    // Tek sada uređaj ulazi u nftables set na hub-u.
    await syncDeviceConfig(client, device.account_id, device.fornect_device_id);

    // Instalacija je na kraju prošla — ranija poruka o neuspjehu više
    // nije tačna i mora nestati, ne stajati kao trajna optužba.
    await resolveConsentFailure(client, device.account_id, device.id);
  } else {
    await client.query(
      `UPDATE consent_records
       SET verification_failed_at = now(), verification_error = $2
       WHERE id = $1`,
      [active.id, input.error?.trim() || 'Certifikat nije prepoznat na uređaju.'],
    );

    // 'failed' je namjerno različito od 'unpaired': korisnik jeste dao
    // pristanak, samo instalacija nije prošla — panel na osnovu toga
    // nudi pomoć umjesto da vrati na početak.
    await client.query(`UPDATE network_devices SET pairing_state = 'failed' WHERE id = $1`, [
      device.id,
    ]);

    // Čovjek je pristao i mislio da je gotovo. Bez ovoga ostaje u
    // uvjerenju da je puna zaštita uključena, a nije.
    await recordConsentFailure(
      client,
      device.account_id,
      device.id,
      device.name ?? device.mac_address,
      input.error?.trim() ?? null,
    );
  }

  return { ok: true, record: await reload(client, active.id) };
}

/** Korak 4 — opoziv pristanka. */
export async function revokeConsent(
  client: PoolClient,
  device: ConsentDeviceRow,
  reason?: string,
): Promise<ConsentResult> {
  const active = await loadActiveConsent(client, device.id);

  if (!active) {
    return { ok: false, code: 409, error: 'Za ovaj uređaj ne postoji važeći pristanak.' };
  }

  await client.query(
    `UPDATE consent_records
     SET revoked_at = now(), revoked_reason = $2
     WHERE id = $1`,
    [active.id, reason?.trim() || 'Opozvano iz admin panela.'],
  );

  // Nakon opoziva uređaj je gost: i dalje ima osnovnu (DNS) zaštitu i
  // internet mu radi, ali presretanja više nema. Namjerno ne ide u
  // 'unpaired', jer to stanje znači "neklasifikovan" i uređaj bi
  // ponovo dobijao captive portal.
  await client.query(
    `UPDATE network_devices
     SET pairing_state = 'guest',
         use_full_protection = false,
         protection_level = 'standard',
         policy_version = NULL
     WHERE id = $1`,
    [device.id],
  );

  await syncDeviceConfig(client, device.account_id, device.fornect_device_id);

  return { ok: true, record: await reload(client, active.id) };
}
