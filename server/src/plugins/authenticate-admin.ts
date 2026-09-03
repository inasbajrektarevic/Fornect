// Admin rute (koje koristi interni admin panel, ne korisnička app)
// se autentifikuju statičkim ključem u X-Admin-Key headeru.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../env';

export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const adminKey = request.headers['x-admin-key'];

  if (adminKey !== env.adminApiKey) {
    return reply.code(401).send({ error: 'Nevažeći ili nedostajući X-Admin-Key.' });
  }
}
