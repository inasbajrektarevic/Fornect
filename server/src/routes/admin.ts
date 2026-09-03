// Interne admin rute — autentifikacija preko X-Admin-Key headera
// (authenticateAdmin), ne preko naloga korisnika (accounts/JWT).

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';
import { authenticateAdmin } from '../plugins/authenticate-admin';

interface PatchDeviceBody {
  name?: string;
  kind?: 'home' | 'pro';
  mode?: 'home' | 'hospitality' | 'agency';
  capacity?: number | null;
}

interface PushConfigBody {
  config_json?: Record<string, unknown>;
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticateAdmin);

  fastify.get('/devices', async (_request, reply) => {
    const { rows } = await pool.query(
      `SELECT *,
         (last_seen_at IS NOT NULL
           AND last_seen_at > now() - (interval '1 minute' * $1)) AS online
       FROM devices
       ORDER BY created_at DESC`,
      [env.deviceOnlineThresholdMinutes],
    );

    return reply.send(rows.map(stripTokenHash));
  });

  fastify.get<{ Params: { id: string } }>('/devices/:id', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT *,
         (last_seen_at IS NOT NULL
           AND last_seen_at > now() - (interval '1 minute' * $2)) AS online
       FROM devices
       WHERE id = $1`,
      [request.params.id, env.deviceOnlineThresholdMinutes],
    );

    const device = rows[0];

    if (!device) {
      return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
    }

    const { rows: configRows } = await pool.query(
      `SELECT version, config_json, created_at, acked_at
       FROM device_configs
       WHERE device_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [device.id],
    );

    return reply.send({
      ...stripTokenHash(device),
      latest_config: configRows[0] ?? null,
    });
  });

  // Whitelist kolona koje admin smije mijenjati preko PATCH-a — imena
  // kolona se NIKAD ne uzimaju direktno iz request bodyja (SQL injection).
  const patchableDeviceFields = ['name', 'kind', 'mode', 'capacity'] as const;

  fastify.patch<{ Params: { id: string }; Body: PatchDeviceBody }>(
    '/devices/:id',
    async (request, reply) => {
      const updates = request.body ?? {};

      const fields: string[] = [];
      const values: unknown[] = [];

      for (const key of patchableDeviceFields) {
        const value = updates[key];

        if (value === undefined) {
          continue;
        }

        fields.push(`${key} = $${fields.length + 1}`);
        values.push(value);
      }

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'Nema polja za izmjenu.' });
      }

      values.push(request.params.id);

      const { rows } = await pool.query(
        `UPDATE devices SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${values.length}
         RETURNING *`,
        values,
      );

      const device = rows[0];

      if (!device) {
        return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
      }

      return reply.send(stripTokenHash(device));
    },
  );

  // Ručno guranje konfiguracije od strane admina — odvojeno od
  // automatske sinhronizacije preko network_devices pairing_state-a
  // (services/device-config-sync.ts).
  fastify.post<{ Params: { id: string }; Body: PushConfigBody }>(
    '/devices/:id/config',
    async (request, reply) => {
      const { config_json: configJson } = request.body ?? {};

      if (!configJson || typeof configJson !== 'object') {
        return reply.code(400).send({ error: 'config_json je obavezan.' });
      }

      const deviceExists = await pool.query('SELECT id FROM devices WHERE id = $1', [
        request.params.id,
      ]);

      if (deviceExists.rowCount === 0) {
        return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO device_configs (device_id, version, config_json)
         VALUES (
           $1,
           (SELECT COALESCE(MAX(version), 0) + 1 FROM device_configs WHERE device_id = $1),
           $2::jsonb
         )
         RETURNING version, config_json, created_at`,
        [request.params.id, JSON.stringify(configJson)],
      );

      return reply.code(201).send(rows[0]);
    },
  );
}

function stripTokenHash(device: Record<string, unknown>): Record<string, unknown> {
  const { token_hash: _tokenHash, ...rest } = device;
  return rest;
}
