// Readiness health check za Dokploy — provjerava ne samo da je proces
// živ (za to služi obično /health), nego i da je konekcija na
// PostgreSQL zaista uspostavljena. Ako baza padne ili je konekcioni
// string pogrešan, ovo mora vratiti ne-200 da Dokploy zna da servis
// nije spreman da prima saobraćaj.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.send({ status: 'ok', db: 'ok' });
    } catch (error) {
      fastify.log.error(error, 'Health check: baza nije dostupna');
      return reply.code(503).send({ status: 'error', db: 'unreachable' });
    }
  });
}
