// Rute koje zove sam Fornect uređaj (Orange Pi agent): registracija,
// heartbeat, i povlačenje/potvrda konfiguracije. Autentifikacija je
// preko Bearer tokena (authenticateDevice), osim register-a, koji se
// zove prije nego uređaj uopšte ima token.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { authenticateDevice } from '../plugins/authenticate-device';
import { generateDeviceToken, hashDeviceToken } from '../services/device-tokens';
import type { DeviceRow } from '../types';

interface RegisterBody {
  name?: string;
  kind?: 'home' | 'pro';
  mode?: 'home' | 'hospitality' | 'agency';
  capacity?: number;
}

interface HeartbeatBody {
  stats?: Record<string, unknown>;
}

interface ConfigAckBody {
  version?: number;
}

export async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    const { name, kind = 'home', mode = 'home', capacity } = request.body ?? {};

    if (!name) {
      return reply.code(400).send({ error: 'name je obavezan.' });
    }

    const token = generateDeviceToken();
    const tokenHash = hashDeviceToken(token);

    const { rows } = await pool.query<DeviceRow>(
      `INSERT INTO devices (name, token_hash, kind, mode, capacity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, tokenHash, kind, mode, capacity ?? null],
    );

    const device = rows[0]!;

    // Token se vraća SAMO ovdje, jednom — uređaj ga mora sačuvati,
    // jer se ne može ponovo pročitati (u bazi je samo hash).
    return reply.code(201).send({
      id: device.id,
      name: device.name,
      kind: device.kind,
      mode: device.mode,
      capacity: device.capacity,
      token,
      created_at: device.created_at,
    });
  });

  fastify.post<{ Params: { id: string }; Body: HeartbeatBody }>(
    '/:id/heartbeat',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;
      const { stats } = request.body ?? {};

      await pool.query(
        `UPDATE devices SET status = 'online', last_seen_at = now(), updated_at = now()
         WHERE id = $1`,
        [device.id],
      );

      await pool.query(
        'INSERT INTO device_heartbeats (device_id, payload) VALUES ($1, $2::jsonb)',
        [device.id, JSON.stringify(stats ?? {})],
      );

      return reply.send({ ok: true, received_at: new Date().toISOString() });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/config',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;

      const { rows } = await pool.query(
        `SELECT version, config_json, created_at
         FROM device_configs
         WHERE device_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [device.id],
      );

      const latest = rows[0];

      // Uređaj bez ijedne konfiguracije (npr. odmah nakon registracije,
      // prije nego je iko uparen) dobija praznu konfiguraciju verzije 0
      // umjesto 404 — agentu je jednostavnije da uvijek dobije isti oblik.
      if (!latest) {
        return reply.send({ version: 0, config_json: {} });
      }

      return reply.send(latest);
    },
  );

  fastify.post<{ Params: { id: string }; Body: ConfigAckBody }>(
    '/:id/config/ack',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;
      const { version } = request.body ?? {};

      if (typeof version !== 'number') {
        return reply.code(400).send({ error: 'version je obavezan.' });
      }

      const { rowCount } = await pool.query(
        `UPDATE device_configs SET acked_at = now()
         WHERE device_id = $1 AND version = $2`,
        [device.id, version],
      );

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Ta verzija konfiguracije ne postoji.' });
      }

      return reply.send({ ok: true });
    },
  );
}
