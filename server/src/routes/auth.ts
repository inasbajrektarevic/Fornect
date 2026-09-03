// Autentifikacija korisničkih naloga (accounts) — registracija, login
// i /me. Nema veze sa authenticateDevice/authenticateAdmin, koji su
// za fizičke uređaje odnosno interni admin panel.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { authenticateAccount } from '../plugins/authenticate-account';
import { hashPassword, verifyPassword } from '../services/passwords';
import { signAccountToken } from '../services/jwt';
import type { AccountRow } from '../types';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

function toPublicAccount(account: AccountRow) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    email_verified: account.email_verified,
    created_at: account.created_at,
  };
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    const { name, email, password } = request.body ?? {};

    if (!name || !email || !password) {
      return reply.code(400).send({ error: 'name, email i password su obavezni.' });
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Lozinka mora imati bar 8 karaktera.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query('SELECT id FROM accounts WHERE email = $1', [
      normalizedEmail,
    ]);

    if ((existing.rowCount ?? 0) > 0) {
      return reply.code(409).send({ error: 'Nalog sa ovim emailom već postoji.' });
    }

    const passwordHash = await hashPassword(password);

    const { rows } = await pool.query<AccountRow>(
      `INSERT INTO accounts (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), normalizedEmail, passwordHash],
    );

    return reply.code(201).send(toPublicAccount(rows[0]!));
  });

  fastify.post<{ Body: LoginBody }>('/login', async (request, reply) => {
    const { email, password } = request.body ?? {};

    if (!email || !password) {
      return reply.code(400).send({ error: 'email i password su obavezni.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await pool.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [
      normalizedEmail,
    ]);

    const account = rows[0];

    // Namjerno ista poruka za "nema naloga" i "pogrešna lozinka" —
    // ne otkrivamo napadaču da li email postoji u sistemu.
    if (!account || !(await verifyPassword(password, account.password_hash))) {
      return reply.code(401).send({ error: 'Pogrešan email ili lozinka.' });
    }

    const token = signAccountToken({ sub: account.id, email: account.email });

    return reply.send({ token, account: toPublicAccount(account) });
  });

  fastify.get('/me', { preHandler: authenticateAccount }, async (request, reply) => {
    const { rows } = await pool.query<AccountRow>('SELECT * FROM accounts WHERE id = $1', [
      request.accountId,
    ]);

    const account = rows[0];

    if (!account) {
      return reply.code(404).send({ error: 'Nalog nije pronađen.' });
    }

    return reply.send(toPublicAccount(account));
  });
}
