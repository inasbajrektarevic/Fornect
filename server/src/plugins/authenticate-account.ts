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
  const { rows } = await pool.query<{ password_changed_at: Date | null }>(
    'SELECT password_changed_at FROM accounts WHERE id = $1',
    [payload.sub],
  );

  const account = rows[0];

  if (!account) {
    return reply.code(401).send({ error: 'Nevažeći ili istekao token.' });
  }

  // `iat` je u sekundama, pa se trenutak promjene zaokruzuje nadolje.
  // Token izdat u istoj sekundi kad je lozinka promijenjena (prijava
  // odmah poslije reseta) mora ostati vazeci.
  if (account.password_changed_at && payload.iat !== undefined) {
    const changedAtSeconds = Math.floor(new Date(account.password_changed_at).getTime() / 1000);

    if (payload.iat < changedAtSeconds) {
      return reply
        .code(401)
        .send({ error: 'Lozinka je promijenjena. Prijavite se ponovo.' });
    }
  }

  request.accountId = payload.sub;
}
