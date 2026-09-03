// JWT provjera za korisničke (account) rute — sve pod /api/v1/app/*.
// Postavlja request.accountId na osnovu `sub` claim-a iz tokena, koji
// rute onda koriste da filtriraju podatke SAMO za taj nalog.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { verifyAccountToken } from '../services/jwt';

export async function authenticateAccount(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Nedostaje Bearer token.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccountToken(token);
    request.accountId = payload.sub;
  } catch {
    return reply.code(401).send({ error: 'Nevažeći ili istekao token.' });
  }
}
