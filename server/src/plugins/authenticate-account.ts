// JWT provjera za korisničke (account) rute — sve pod /api/v1/app/*.
// Postavlja request.accountId na osnovu `sub` claim-a iz tokena, koji
// rute onda koriste da filtriraju podatke SAMO za taj nalog.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { pool } from '../db';
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

  let payload: ReturnType<typeof verifyAccountToken>;

  try {
    payload = verifyAccountToken(token);
  } catch {
    return reply.code(401).send({ error: 'Nevažeći ili istekao token.' });
  }

  // Potpis tokena nije dovoljan. Token vrijedi 30 dana, pa bez ove
  // provjere reset lozinke ne bi izbacio nikoga ko je vec prijavljen —
  // a to je cesto upravo razlog reseta. Isto vazi i za obrisan nalog.
  //
  // Cijena je jedan upit po zahtjevu, po primarnom kljucu.
  const { rows } = await pool.query<{ password_version: number }>(
    'SELECT password_version FROM accounts WHERE id = $1',
    [payload.sub],
  );

  const account = rows[0];

  if (!account) {
    return reply.code(401).send({ error: 'Nevažeći ili istekao token.' });
  }

  // Tokeni izdati prije migracije 021 nemaju verziju: vaze kao 0, pa
  // niko nije izbacen dok ne promijeni lozinku.
  if ((payload.pwv ?? 0) !== account.password_version) {
    return reply.code(401).send({ error: 'Lozinka je promijenjena. Prijavite se ponovo.' });
  }

  request.accountId = payload.sub;
}
