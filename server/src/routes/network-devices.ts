// CRUD za network_devices — uređaje na mreži koje account upravlja
// kroz admin/mobilnu app. Sve rute su pod authenticateAccount hookom
// (registrovanim na roditeljskom /api/v1/app plugin-u), pa je
// request.accountId uvijek dostupan i SVI upiti su njime filtrirani —
// korisnik ne smije ni pročitati ni izmijeniti tuđi uređaj.

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';
import { applyAutoGuestPolicy } from '../services/auto-guest';
import { loadActiveConsent } from '../services/consent-actions';
import { syncDeviceConfig } from '../services/device-config-sync';
import { normaliseMac } from '../services/mac';
import {
  getAccountTimeZone,
  offlineAlertEnabled,
  recordPresenceChange,
  resolveOfflineNotices,
} from '../services/notifications';

interface NetworkDeviceRow {
  id: string;
  account_id: string;
  fornect_device_id: string | null;
  mac_address: string;
  name: string;
  type: 'phone' | 'tv' | 'console' | 'unknown';
  profile: 'Child' | 'Teen' | 'Adult' | 'Admin' | null;
  protection_level: 'standard' | 'full' | 'needs-setup';
  pairing_state: 'unpaired' | 'guest' | 'pairing' | 'paired' | 'failed';
  use_full_protection: boolean;
  online: boolean;
  blocked_ads_today: number;
  override_until: string | null;
  restrictions: unknown;
  alert_when_offline: boolean | null;
  schedule: unknown;
  created_at: string;
  /** Računa se pri čitanju liste (GET /), nije kolona u tabeli. */
  licence_slot?: number;
  over_capacity?: boolean;
}

interface CreateBody {
  fornect_device_id?: string | null;
  mac_address?: string;
  name?: string;
  type?: NetworkDeviceRow['type'];
  profile?: NetworkDeviceRow['profile'];
  protection_level?: NetworkDeviceRow['protection_level'];
  pairing_state?: NetworkDeviceRow['pairing_state'];
  use_full_protection?: boolean;
  restrictions?: unknown;
  alert_when_offline?: boolean;
  schedule?: unknown;
}

// PATCH ne dozvoljava mijenjanje mac_address/account_id/fornect_device_id
// — mac adresa je identitet uređaja, a spajanje sa hub-om ide kroz
// pairing tok, ne kroz proizvoljan PATCH.
type PatchBody = Omit<CreateBody, 'mac_address' | 'fornect_device_id'> & {
  online?: boolean;
  blocked_ads_today?: number;
  override_until?: string | null;
};

const CREATABLE_FIELDS = [
  'fornect_device_id',
  'mac_address',
  'name',
  'type',
  'profile',
  'protection_level',
  'pairing_state',
  'use_full_protection',
  'restrictions',
  'alert_when_offline',
  'schedule',
] as const;

const PATCHABLE_FIELDS = [
  'name',
  'type',
  'profile',
  'protection_level',
  'pairing_state',
  'use_full_protection',
  'online',
  'blocked_ads_today',
  'override_until',
  'restrictions',
  'alert_when_offline',
  'schedule',
] as const;

const JSONB_FIELDS = new Set(['restrictions', 'schedule']);

// Puna zastita znaci da uredjaj presrece saobracaj, a to smije samo uz
// pristanak i dokazano instaliran zastitni profil. Taj put vodi server
// (consent-actions.ts: pristanak -> provjera -> 'paired' + 'full'). Panel
// nivo moze VRATITI na punu kad je profil vec tu (spustio je na
// standardnu, pa predomislio se), ali je ne moze proglasiti bez njega.
// Ranije je podesavanje novog uredjaja upisivalo 'full' odmah, pa je
// kartica uredjaja pisala "Puna zastita" za uredjaj bez certifikata.
const FULL_NEEDS_PROFILE = {
  error: 'Puna zaštita traži pristanak i instaliran zaštitni profil.',
  code: 'full-protection-needs-profile',
};

// pairing_state = 'paired' je ono po cemu server hubu javlja koje MAC
// adrese smije presretati (device-config-sync.ts -> consented_macs).
// Zato u 'paired' vodi SAMO tok pristanka: pristanak -> provjera
// certifikata (consent-actions.ts). Ranije je ovaj CRUD primao
// pairing_state bez ogranicenja, pa je jedan POST ili PATCH sa
// 'paired' stavljao uredjaj pod presretanje bez ijednog zapisa o
// pristanku. Ekrani panela to nisu radili, ali API jeste dozvoljavao.
//
// Panel smije samo ovo:
//   - novi uredjaj: 'unpaired' (podrazumijevano) ili 'guest';
//   - 'unpaired' -> 'guest': svrstavanje u goste (red "Novi uredjaji");
//   - 'failed' ili 'paired' -> 'pairing': ponovna instalacija profila,
//     i to samo dok pristanak vazi. Pristanak se tada ne trazi ponovo.
// Sve ostalo (paired, failed, unpaired, i guest iz drugih stanja) radi
// server kroz pristanak, provjeru, opoziv ili event sa huba.
const PAIRING_STATE_SERVER_ONLY = {
  error: 'Ovo stanje uparivanja postavlja samo tok pristanka.',
  code: 'pairing-state-needs-consent',
};

const CREATABLE_PAIRING_STATES = new Set(['unpaired', 'guest']);

export async function networkDeviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const client = await pool.connect();

    try {
      // Politika se primjenjuje pri čitanju, kao i obavještenja o
      // kapacitetu i prisutnosti — bez posla u pozadini koji bi mogao
      // stati a da to niko ne primijeti.
      await applyAutoGuestPolicy(client, request.accountId!);

      // Prekoračenje licence se NE pamti u koloni nego se računa pri
      // čitanju, po redoslijedu pojavljivanja: prvih `capacity`
      // uređaja je unutar licence, ostali su preko. Zapamćena zastava
      // bi zastarjela čim vlasnik obriše neki uređaj — ovako se mjesto
      // samo oslobodi.
      //
      // Nalog bez uparenog hub-a nema ni licencu, pa nema ni
      // prekoračenja. Panel je do sada u tom slučaju prikazivao
      // zakucanih "20", što je bila izmišljena granica.
      const { rows } = await client.query<NetworkDeviceRow>(
        `WITH licence AS (
           SELECT coalesce(d.capacity, 0) AS capacity
           FROM devices d
           WHERE d.claimed_by_account_id = $1
           ORDER BY d.created_at ASC
           LIMIT 1
         ),
         ranked AS (
           SELECT nd.*,
                  -- ::int jer bi bigint stigao u panel kao string.
                  (row_number() OVER (ORDER BY nd.created_at ASC, nd.id ASC))::int
                    AS licence_slot
           FROM network_devices nd
           WHERE nd.account_id = $1
         )
         SELECT ranked.*,
                (coalesce((SELECT capacity FROM licence), 0) > 0
                 AND ranked.licence_slot > (SELECT capacity FROM licence)) AS over_capacity
         FROM ranked
         ORDER BY ranked.created_at DESC`,
        [request.accountId],
      );

      return reply.send(rows);
    } finally {
      client.release();
    }
  });

  fastify.post<{ Body: CreateBody }>('/', async (request, reply) => {
    const body = request.body ?? {};

    if (!body.mac_address || !body.name) {
      return reply.code(400).send({ error: 'mac_address i name su obavezni.' });
    }

    if (body.pairing_state !== undefined && !CREATABLE_PAIRING_STATES.has(body.pairing_state)) {
      return reply.code(400).send(PAIRING_STATE_SERVER_ONLY);
    }

    if (body.protection_level === 'full' && body.pairing_state !== 'paired') {
      return reply.code(400).send(FULL_NEEDS_PROFILE);
    }

    // Isti oblik kao sa huba (services/mac.ts). Bez ovoga je uređaj koji
    // vlasnik doda velikim slovima za hub nevidljiv, a kad ga hub javi
    // kao nov, postane drugi uređaj i uzme drugo mjesto u licenci.
    const macAddress = normaliseMac(body.mac_address);

    if (!macAddress) {
      return reply
        .code(400)
        .send({ error: 'mac_address mora biti MAC adresa, npr. aa:bb:cc:dd:ee:ff.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // fornect_device_id se NIKAD ne uzima direktno iz requesta —
      // account bi mogao proslijediti tuđi device UUID i time
      // efektivno "prikvačiti" svoj network_device na hub koji nije
      // njegov. Umjesto toga, server sam nalazi hub kojim account
      // stvarno raspolaže (preko devices.claimed_by_account_id,
      // postavljenog isključivo kroz POST /app/hub/claim).
      const { rows: hubRows } = await client.query<{ id: string }>(
        `SELECT id FROM devices WHERE claimed_by_account_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [request.accountId],
      );

      const resolvedBody: CreateBody = {
        ...body,
        mac_address: macAddress,
        fornect_device_id: hubRows[0]?.id ?? null,
      };

      const { columns, placeholders, values } = buildInsert(
        request.accountId!,
        resolvedBody,
        CREATABLE_FIELDS,
      );

      const { rows } = await client.query<NetworkDeviceRow>(
        `INSERT INTO network_devices (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values,
      );

      const created = rows[0]!;

      if (created.pairing_state === 'paired') {
        await syncDeviceConfig(client, created.account_id, created.fornect_device_id);
      }

      await client.query('COMMIT');

      return reply.code(201).send(created);
    } catch (error) {
      await client.query('ROLLBACK');

      // account_id + mac_address unique constraint iz migracije 005.
      if (isUniqueViolation(error)) {
        return reply
          .code(409)
          .send({ error: 'Uređaj sa ovom MAC adresom već postoji na ovom nalogu.' });
      }

      throw error;
    } finally {
      client.release();
    }
  });

  fastify.patch<{ Params: { id: string }; Body: PatchBody }>('/:id', async (request, reply) => {
    const body = request.body ?? {};

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of PATCHABLE_FIELDS) {
      const value = body[key];

      if (value === undefined) {
        continue;
      }

      values.push(JSONB_FIELDS.has(key) ? JSON.stringify(value) : value);
      fields.push(`${key} = $${values.length}${JSONB_FIELDS.has(key) ? '::jsonb' : ''}`);
    }

    if (fields.length === 0) {
      return reply.code(400).send({ error: 'Nema polja za izmjenu.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: beforeRows } = await client.query<NetworkDeviceRow>(
        'SELECT * FROM network_devices WHERE id = $1 AND account_id = $2 FOR UPDATE',
        [request.params.id, request.accountId],
      );

      const before = beforeRows[0];

      if (!before) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
      }

      const nextPairing = body.pairing_state;

      if (nextPairing !== undefined && nextPairing !== before.pairing_state) {
        const allowed =
          (nextPairing === 'guest' && before.pairing_state === 'unpaired') ||
          (nextPairing === 'pairing' &&
            (before.pairing_state === 'failed' || before.pairing_state === 'paired') &&
            (await loadActiveConsent(client, before.id)) !== undefined);

        if (!allowed) {
          await client.query('ROLLBACK');
          return reply.code(400).send(PAIRING_STATE_SERVER_ONLY);
        }

        // Ponovna instalacija sa 'paired': uredjaj izlazi iz
        // consented_macs, pa ni nivo vise nije puni. Isto radi
        // consent-actions.ts kad uredjaj napusti 'paired'.
        if (before.pairing_state === 'paired' && body.protection_level === undefined) {
          fields.push(
            `protection_level = CASE WHEN protection_level = 'full' THEN 'standard' ELSE protection_level END`,
          );
        }
      }

      values.push(request.params.id, request.accountId);

      const { rows } = await client.query<NetworkDeviceRow>(
        `UPDATE network_devices SET ${fields.join(', ')}
         WHERE id = $${values.length - 1} AND account_id = $${values.length}
         RETURNING *`,
        values,
      );

      const after = rows[0]!;

      // Provjerava se samo kad zahtjev TRAZI punu. Zatecena 'full' uz
      // drugo stanje ne smije blokirati npr. preimenovanje.
      if (body.protection_level === 'full' && after.pairing_state !== 'paired') {
        await client.query('ROLLBACK');
        return reply.code(400).send(FULL_NEEDS_PROFILE);
      }

      await syncIfPairingChanged(client, before, after);

      // Obavještenje o odlasku sa mreže nastaje ovdje, a ne u panelu
      // pri otvaranju liste. Isti poziv radi i ruta kojom hub javlja
      // prisutnost — da poruka ne zavisi od toga ko je promjenu javio.
      if (before.online !== after.online) {
        await recordPresenceChange(
          client,
          after.account_id,
          await getAccountTimeZone(client, after.account_id),
          before,
          after,
        );
      }

      // Isključeno praćenje skida i ono što o tom uređaju već stoji.
      if (offlineAlertEnabled(before) && !offlineAlertEnabled(after)) {
        await resolveOfflineNotices(client, after.account_id, after.id);
      }

      await client.query('COMMIT');

      return reply.send(after);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query<NetworkDeviceRow>(
        'DELETE FROM network_devices WHERE id = $1 AND account_id = $2 RETURNING *',
        [request.params.id, request.accountId],
      );

      const deleted = rows[0];

      if (!deleted) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
      }

      if (deleted.pairing_state === 'paired') {
        await syncDeviceConfig(client, deleted.account_id, deleted.fornect_device_id);
      }

      await client.query('COMMIT');

      return reply.code(204).send();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}

async function syncIfPairingChanged(
  client: PoolClient,
  before: NetworkDeviceRow,
  after: NetworkDeviceRow,
): Promise<void> {
  const wasPaired = before.pairing_state === 'paired';
  const isPaired = after.pairing_state === 'paired';

  if (wasPaired === isPaired) {
    return;
  }

  // Ako se hub promijenio u istom PATCH-u dok je i dalje uparen, treba
  // osvježiti listu i na starom i na novom hub-u.
  await syncDeviceConfig(client, after.account_id, after.fornect_device_id);

  if (before.fornect_device_id && before.fornect_device_id !== after.fornect_device_id) {
    await syncDeviceConfig(client, before.account_id, before.fornect_device_id);
  }
}

function buildInsert(
  accountId: string,
  body: CreateBody,
  allowedFields: readonly string[],
): { columns: string[]; placeholders: string[]; values: unknown[] } {
  const columns = ['account_id'];
  const values: unknown[] = [accountId];
  const placeholders = ['$1'];

  for (const key of allowedFields) {
    const value = (body as Record<string, unknown>)[key];

    if (value === undefined) {
      continue;
    }

    values.push(JSONB_FIELDS.has(key) ? JSON.stringify(value) : value);
    columns.push(key);
    placeholders.push(`$${values.length}${JSONB_FIELDS.has(key) ? '::jsonb' : ''}`);
  }

  return { columns, placeholders, values };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === '23505',
  );
}
