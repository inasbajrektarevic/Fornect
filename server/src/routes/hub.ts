// GET /api/v1/app/hub — fizički Fornect uređaj (hub) uparen sa
// trenutnim nalogom, plus koliko network_devices je trenutno na
// njega povezano. "Hub" naloga se određuje preko prvog network_device
// zapisa koji ima postavljen fornect_device_id — u tipičnom Home
// slučaju svi network_devices jednog naloga dijele isti hub.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';

export async function hubRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/hub', async (request, reply) => {
    const { rows } = await pool.query(
      `WITH hub AS (
         SELECT fornect_device_id
         FROM network_devices
         WHERE account_id = $1 AND fornect_device_id IS NOT NULL
         ORDER BY created_at ASC
         LIMIT 1
       )
       SELECT
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
       JOIN hub ON hub.fornect_device_id = d.id`,
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
}
