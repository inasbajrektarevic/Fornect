// GET /api/v1/app/hub — fizički Fornect uređaj (hub) uparen sa
// trenutnim nalogom (prvi/najstariji ako ih ima više — Pro/Agency
// nalozi sa više hub-ova imaju zaseban prikaz, ovo ostaje POC
// pojednostavljenje za Home slučaj).
//
// POST /api/v1/app/hub/claim — account uparuje fizički hub unosom
// pairing koda koji je uređaj generisao (vidi services/hub-pairing.ts
// i POST /api/v1/devices/register, /:id/pairing-code). Ovo je jedini
// legitiman put ka claimed_by_account_id — network_devices CRUD ga
// više ne dozvoljava direktno (vidi routes/network-devices.ts).

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';

interface ClaimBody {
  pairing_code?: string;
}

export async function hubRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/hub', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.kind,
         d.mode,
         d.capacity,
         (d.last_seen_at IS NOT NULL
           AND d.last_seen_at > now() - (interval '1 minute' * $2)) AS online,
         (SELECT count(*)::int FROM network_devices nd
          WHERE nd.fornect_device_id = d.id AND nd.account_id = $1) AS connected_devices
       FROM devices d
       WHERE d.claimed_by_account_id = $1
       ORDER BY d.created_at ASC
       LIMIT 1`,
      [request.accountId, env.deviceOnlineThresholdMinutes],
    );

    const hub = rows[0];

    if (!hub) {
      return reply
        .code(404)
        .send({ error: 'Nalog još nije uparen ni sa jednim Fornect uređajem.' });
    }

    return reply.send(hub);
  });

  fastify.post<{ Body: ClaimBody }>(
    '/hub/claim',
    {
      // Kod je samo 6 cifara — rate limit po nalogu je ključna zaštita
      // od brute-force pogađanja (dodatno uz kratak TTL koda).
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const pairingCode = request.body?.pairing_code?.trim();

      if (!pairingCode) {
        return reply.code(400).send({ error: 'pairing_code je obavezan.' });
      }

      const { rows } = await pool.query(
        `UPDATE devices
         SET claimed_by_account_id = $1, pairing_code = NULL, pairing_code_expires_at = NULL
         WHERE pairing_code = $2
           AND pairing_code_expires_at > now()
           AND claimed_by_account_id IS NULL
         RETURNING id, name, kind, mode, capacity`,
        [request.accountId, pairingCode],
      );

      const device = rows[0];

      if (!device) {
        return reply
          .code(404)
          .send({ error: 'Kod je netačan, istekao, ili je uređaj već uparen.' });
      }

      return reply.code(200).send({ ...device, online: false, connected_devices: 0 });
    },
  );
}
