// CRUD za network_devices — uređaje na mreži koje account upravlja
// kroz admin/mobilnu app. Sve rute su pod authenticateAccount hookom
// (registrovanim na roditeljskom /api/v1/app plugin-u), pa je
// request.accountId uvijek dostupan i SVI upiti su njime filtrirani —
// korisnik ne smije ni pročitati ni izmijeniti tuđi uređaj.

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';
import { syncConsentedMacs } from '../services/device-config-sync';

interface NetworkDeviceRow {
  id: string;
  account_id: string;
  fornect_device_id: string | null;
  mac_address: string;
  name: string;
  type: 'phone' | 'tv' | 'console' | 'unknown';
  profile: 'Child' | 'Teen' | 'Adult' | 'Admin' | null;
  protection_level: 'standard' | 'full' | 'needs-setup';
  pairing_state: 'unpaired' | 'pairing' | 'paired' | 'failed';
  use_full_protection: boolean;
  online: boolean;
  blocked_ads_today: number;
  override_until: string | null;
  restrictions: unknown;
  alert_when_offline: boolean | null;
  schedule: unknown;
  created_at: string;
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

export async function networkDeviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const { rows } = await pool.query<NetworkDeviceRow>(
      'SELECT * FROM network_devices WHERE account_id = $1 ORDER BY created_at DESC',
      [request.accountId],
    );

    return reply.send(rows);
  });

  fastify.post<{ Body: CreateBody }>('/', async (request, reply) => {
    const body = request.body ?? {};

    if (!body.mac_address || !body.name) {
      return reply.code(400).send({ error: 'mac_address i name su obavezni.' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { columns, placeholders, values } = buildInsert(
        request.accountId!,
        body,
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
        await syncConsentedMacs(client, created.account_id, created.fornect_device_id);
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

      values.push(request.params.id, request.accountId);

      const { rows } = await client.query<NetworkDeviceRow>(
        `UPDATE network_devices SET ${fields.join(', ')}
         WHERE id = $${values.length - 1} AND account_id = $${values.length}
         RETURNING *`,
        values,
      );

      const after = rows[0]!;

      await syncIfPairingChanged(client, before, after);

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
        await syncConsentedMacs(client, deleted.account_id, deleted.fornect_device_id);
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
  await syncConsentedMacs(client, after.account_id, after.fornect_device_id);

  if (before.fornect_device_id && before.fornect_device_id !== after.fornect_device_id) {
    await syncConsentedMacs(client, before.account_id, before.fornect_device_id);
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
