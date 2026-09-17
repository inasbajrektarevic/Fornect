// GET  /api/v1/app/notifications           — lista za trenutni nalog
// POST /api/v1/app/notifications/read-all   — sve pročitano
// POST /api/v1/app/notifications/:id/read   — jedno pročitano
//
// Sve rute su pod authenticateAccount hookom (roditeljski /api/v1/app
// plugin), pa je request.accountId uvijek dostupan i svaki upit je
// njime filtriran — tuđe obavještenje se ne smije ni pročitati ni
// označiti.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { syncCapacityNotice, type NotificationRow } from '../services/notifications';

// Lista je pregled, ne arhiva. Dublja historija ima smisla tek kada
// postoji ekran koji je traži.
const LIST_LIMIT = 50;

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const client = await pool.connect();

    try {
      // Kapacitet se računa pri čitanju, kao i politika gostiju.
      await syncCapacityNotice(client, request.accountId!);

      const { rows } = await client.query<NotificationRow>(
        `SELECT * FROM notifications
         WHERE account_id = $1 AND resolved_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [request.accountId, LIST_LIMIT],
      );

      return reply.send(rows);
    } finally {
      client.release();
    }
  });

  fastify.post('/read-all', async (request, reply) => {
    await pool.query(
      `UPDATE notifications
       SET read_at = now()
       WHERE account_id = $1 AND read_at IS NULL AND resolved_at IS NULL`,
      [request.accountId],
    );

    return reply.code(204).send();
  });

  fastify.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const { rows } = await pool.query<NotificationRow>(
      `UPDATE notifications
       SET read_at = coalesce(read_at, now())
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      [request.params.id, request.accountId],
    );

    const notification = rows[0];

    if (!notification) {
      return reply.code(404).send({ error: 'Obavještenje nije pronađeno.' });
    }

    return reply.send(notification);
  });
}
