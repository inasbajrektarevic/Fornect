// Autentifikacija korisničkih naloga (accounts) — registracija, login
// i /me. Nema veze sa authenticateDevice/authenticateAdmin, koji su
// za fizičke uređaje odnosno interni admin panel.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';
import { authenticateAccount } from '../plugins/authenticate-account';
import { hashPassword, verifyPassword } from '../services/passwords';
import { signAccountToken } from '../services/jwt';
import { sendMail, verificationMail } from '../services/mailer';
import { isKnownTimeZone } from '../services/schedule-window';

import {
  generateVerificationCode,
  hashVerificationCode,
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  verificationCodeMatches,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../services/email-verification';

import type { AccountRow } from '../types';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  /** IANA zona iz pregledača; koristi je server pri računu rasporeda. */
  timezone?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface VerifyEmailBody {
  email?: string;
  code?: string;
}

interface ResendBody {
  email?: string;
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

/**
 * Napravi novi kod, zapiši mu otisak i pošalji ga na adresu.
 *
 * Slanje se namjerno ne čeka blokirajuće na rutama koje ga pozivaju:
 * ako SMTP zastane, korisnik ne smije ostati da gleda u prazan ekran.
 * Zato rute ovo zovu i hvataju grešku u logu — nalog je već napravljen
 * i kod se uvijek može ponovo poslati.
 */
async function issueVerificationCode(accountId: string, email: string): Promise<void> {
  const code = generateVerificationCode();

  await pool.query(
    `UPDATE accounts
     SET verification_code_hash = $2,
         verification_code_expires_at = now() + ($3 || ' minutes')::interval,
         verification_attempts = 0,
         verification_sent_at = now()
     WHERE id = $1`,
    [accountId, hashVerificationCode(code), String(VERIFICATION_CODE_TTL_MINUTES)],
  );

  await sendMail(verificationMail(email, code, VERIFICATION_CODE_TTL_MINUTES));
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    const { name, email, password, timezone } = request.body ?? {};

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

    // Zona koju pregledač pošalje se provjerava prije upisa: nepoznata
    // vrijednost bi kasnije tiho pokvarila račun "u vrijeme rasporeda",
    // a to je greška koja se ne vidi dok se ne desi.
    const resolvedTimeZone =
      timezone && isKnownTimeZone(timezone) ? timezone : 'Europe/Sarajevo';

    const { rows } = await pool.query<AccountRow>(
      `INSERT INTO accounts (name, email, password_hash, timezone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), normalizedEmail, passwordHash, resolvedTimeZone],
    );

    const account = rows[0]!;

    try {
      await issueVerificationCode(account.id, account.email);
    } catch (error) {
      // Neuspjelo slanje ne smije oboriti registraciju — nalog postoji,
      // a korisnik kod može zatražiti ponovo.
      request.log.error({ error }, 'Slanje koda za potvrdu nije uspjelo');
    }

    return reply.code(201).send(toPublicAccount(account));
  });

  fastify.post<{ Body: VerifyEmailBody }>('/verify-email', async (request, reply) => {
    const { email, code } = request.body ?? {};

    if (!email || !code) {
      return reply.code(400).send({ error: 'email i code su obavezni.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    const { rows } = await pool.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [
      normalizedEmail,
    ]);

    const account = rows[0];

    // Ista poruka i kad naloga nema i kad je kod pogrešan — inače bi
    // se ova ruta mogla koristiti da se otkrije ko ima nalog.
    const invalid = { error: 'Kod nije ispravan ili je istekao.' };

    if (!account) {
      return reply.code(400).send(invalid);
    }

    if (account.email_verified) {
      return reply.send({ ...toPublicAccount(account), already_verified: true });
    }

    const expired =
      !account.verification_code_expires_at ||
      new Date(account.verification_code_expires_at).getTime() < Date.now();

    if (expired) {
      return reply.code(400).send(invalid);
    }

    if (account.verification_attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return reply.code(429).send({
        error: 'Previše pogrešnih pokušaja. Zatražite novi kod.',
      });
    }

    if (!verificationCodeMatches(trimmedCode, account.verification_code_hash)) {
      await pool.query(
        'UPDATE accounts SET verification_attempts = verification_attempts + 1 WHERE id = $1',
        [account.id],
      );

      return reply.code(400).send(invalid);
    }

    // Kod se poništava odmah — jednom iskorišten ne smije vrijediti
    // drugi put ni ako je neko usput vidio mail.
    const { rows: updated } = await pool.query<AccountRow>(
      `UPDATE accounts
       SET email_verified = true,
           verification_code_hash = NULL,
           verification_code_expires_at = NULL,
           verification_attempts = 0
       WHERE id = $1
       RETURNING *`,
      [account.id],
    );

    return reply.send(toPublicAccount(updated[0]!));
  });

  fastify.post<{ Body: ResendBody }>('/resend-verification', async (request, reply) => {
    const { email } = request.body ?? {};

    if (!email) {
      return reply.code(400).send({ error: 'email je obavezan.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await pool.query<AccountRow>('SELECT * FROM accounts WHERE email = $1', [
      normalizedEmail,
    ]);

    const account = rows[0];

    // Odgovor je isti bez obzira postoji li nalog i je li već potvrđen.
    // Inače bi se ova ruta koristila za provjeru koje adrese imaju nalog.
    const sent = { ok: true, message: 'Ako nalog postoji, kod je poslan.' };

    if (!account || account.email_verified) {
      return reply.send(sent);
    }

    const lastSent = account.verification_sent_at
      ? new Date(account.verification_sent_at).getTime()
      : 0;

    const secondsSince = (Date.now() - lastSent) / 1000;

    if (secondsSince < RESEND_COOLDOWN_SECONDS) {
      return reply.code(429).send({
        error: `Kod je već poslan. Pokušajte ponovo za ${Math.ceil(
          RESEND_COOLDOWN_SECONDS - secondsSince,
        )} sekundi.`,
      });
    }

    try {
      await issueVerificationCode(account.id, account.email);
    } catch (error) {
      request.log.error({ error }, 'Ponovno slanje koda nije uspjelo');

      return reply.code(502).send({ error: 'Slanje maila trenutno ne radi.' });
    }

    return reply.send(sent);
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

    // Iza prekidača, jer uključivanje ovoga prije nego SMTP proradi
    // zaključava sve postojeće naloge (vidi env.ts).
    if (env.requireVerifiedEmail && !account.email_verified) {
      return reply.code(403).send({
        error: 'Email adresa nije potvrđena.',
        email_verified: false,
      });
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
