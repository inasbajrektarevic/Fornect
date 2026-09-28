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
import { CONSENT_POLICY_VERSION } from '../services/consent-policy';

import {
  resolveClassifiedDeviceNotices,
  syncCapacityNotice,
  syncReconsentNotice,
  type NotificationRow,
} from '../services/notifications';

// Lista je pregled, ne arhiva. Dublja historija ima smisla tek kada
// postoji ekran koji je traži.
const LIST_LIMIT = 50;

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const client = await pool.connect();

    try {
      // Kapacitet se računa pri čitanju, kao i politika gostiju.
      await syncCapacityNotice(client, request.accountId!);

      // Isto i za uređaje koji su u međuvremenu klasifikovani: lista
      // koja nudi odluku o uređaju o kojem je odluka već pala tjera
      // čovjeka da otvori ekran i vidi da nema šta da radi — pa
      // sljedeći put neće ni otvoriti.
      await resolveClassifiedDeviceNotices(client, request.accountId!);

      // I pristanci dati na stariju verziju politike, zbirno.
      await syncReconsentNotice(client, request.accountId!, CONSENT_POLICY_VERSION);

      const { rows } = await client.query<NotificationRow>(
        // Ime uređaja u tekstu obavještenja se uzima iz TRENUTNOG zapisa
        // uređaja, ne iz snimka u params. Obavještenje "nov uređaj" nastaje
        // u trenutku kad agent još zna samo MAC; ime (iz DHCP-a ili koje
        // vlasnik da u panelu) stigne kasnije, a staro obavještenje bi
        // zauvijek pokazivalo MAC.
        `SELECT n.*,
                CASE WHEN nd.name IS NOT NULL AND n.params ? 'name'
                     THEN n.params || jsonb_build_object('name', nd.name)
                     ELSE n.params END AS params
         FROM notifications n
         LEFT JOIN network_devices nd ON nd.id = n.network_device_id
         WHERE n.account_id = $1 AND n.resolved_at IS NULL
         ORDER BY n.created_at DESC
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
