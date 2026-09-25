// Autentifikacija korisničkih naloga (accounts) — registracija, login
// i /me. Nema veze sa authenticateDevice/authenticateAdmin, koji su
// za fizičke uređaje odnosno interni admin panel.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';
import { authenticateAccount } from '../plugins/authenticate-account';
import { hashPassword, verifyPassword } from '../services/passwords';
import { signAccountToken } from '../services/jwt';
import { passwordResetMail, sendMail, verificationMail } from '../services/mailer';
import { isKnownTimeZone } from '../services/schedule-window';

import {
  generateVerificationCode,
  hashVerificationCode,
  MAX_VERIFICATION_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  verificationCodeMatches,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../services/email-verification';

import {
  generatePasswordResetCode,
  hashPasswordResetCode,
  MAX_PASSWORD_RESET_ATTEMPTS,
  MAX_PASSWORD_RESETS_PER_DAY,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetCodeMatches,
} from '../services/password-reset';

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

interface ForgotPasswordBody {
  email?: string;
}

interface ResetPasswordBody {
  email?: string;
  code?: string;
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

  // ---------------------------------------------------------------
  // Zaboravljena lozinka — dva koraka:
  //   POST /forgot-password  { email }                 → kod na mail
  //   POST /reset-password   { email, code, password } → nova lozinka
  //
  // Nijedan odgovor ne otkriva postoji li nalog: /forgot-password uvijek
  // vraca isto, a /reset-password daje istu poruku za nepostojeci nalog,
  // pogresan, istekao ili potrosen kod.
  // ---------------------------------------------------------------

  fastify.post<{ Body: ForgotPasswordBody }>('/forgot-password', async (request, reply) => {
    const { email } = request.body ?? {};

    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'Unesite ispravnu email adresu.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const sent = { ok: true, message: 'Ako nalog postoji, kod je poslan.' };

    const code = generatePasswordResetCode();

    // Jedan upis koji sam provjerava oba ogranicenja (pauza izmedju
    // slanja i broj kodova u 24 sata). Ako ijedno ne dozvoljava, upis
    // ne prodje i mail se ne salje — ali odgovor je isti, jer bi
    // "sacekajte 40 sekundi" otkrilo da nalog postoji.
    const { rows } = await pool.query<{ email: string }>(
      `UPDATE accounts
       SET password_reset_code_hash = $2,
           password_reset_expires_at = now() + ($3 || ' minutes')::interval,
           password_reset_attempts = 0,
           password_reset_sent_at = now(),
           password_reset_requests = CASE
             WHEN password_reset_window_started_at IS NULL
               OR password_reset_window_started_at < now() - interval '24 hours'
             THEN 1
             ELSE password_reset_requests + 1
           END,
           password_reset_window_started_at = CASE
             WHEN password_reset_window_started_at IS NULL
               OR password_reset_window_started_at < now() - interval '24 hours'
             THEN now()
             ELSE password_reset_window_started_at
           END
       WHERE email = $1
         AND (password_reset_sent_at IS NULL
              OR password_reset_sent_at < now() - ($4 || ' seconds')::interval)
         AND (password_reset_window_started_at IS NULL
              OR password_reset_window_started_at < now() - interval '24 hours'
              OR password_reset_requests < $5)
       RETURNING email`,
      [
        normalizedEmail,
        hashPasswordResetCode(code),
        String(PASSWORD_RESET_TTL_MINUTES),
        String(PASSWORD_RESET_COOLDOWN_SECONDS),
        MAX_PASSWORD_RESETS_PER_DAY,
      ],
    );

    const account = rows[0];

    if (account) {
      // Slanje se NE ceka. Da se ceka, odgovor za postojeci nalog bi
      // trajao koliko i SMTP (stotine milisekundi), a za nepostojeci
      // odmah — razlika po kojoj se nalozi mogu pobrojati. Greska ide
      // u log; korisnik moze zatraziti kod ponovo.
      void sendMail(passwordResetMail(account.email, code, PASSWORD_RESET_TTL_MINUTES)).catch(
        (error: unknown) => {
          request.log.error({ error }, 'Slanje koda za novu lozinku nije uspjelo');
        },
      );
    }

    return reply.send(sent);
  });

  fastify.post<{ Body: ResetPasswordBody }>('/reset-password', async (request, reply) => {
    const { email, code, password } = request.body ?? {};

    if (!email || !code || !password) {
      return reply.code(400).send({ error: 'email, code i password su obavezni.' });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return reply
        .code(400)
        .send({ error: `Lozinka mora imati bar ${MIN_PASSWORD_LENGTH} karaktera.` });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Jedna poruka za sve neuspjehe: nema naloga, nema koda, istekao,
    // pogresan, previse pokusaja. Posebna poruka za "previse pokusaja"
    // bi otkrila da iza adrese stoji nalog sa aktivnim kodom.
    const invalid = {
      error: 'Kod nije ispravan ili je istekao. Ako ste više puta pogriješili, zatražite novi kod.',
    };

    // Pokusaj se TROSI prije poredjenja, u istom upisu koji provjerava
    // granicu. Da se prvo poredi pa onda broji, istovremeni zahtjevi bi
    // svi prosli provjeru "manje od pet" i dobili vise pokusaja.
    const { rows } = await pool.query<{ id: string; password_reset_code_hash: string }>(
      `UPDATE accounts
       SET password_reset_attempts = password_reset_attempts + 1
       WHERE email = $1
         AND password_reset_code_hash IS NOT NULL
         AND password_reset_expires_at > now()
         AND password_reset_attempts < $2
       RETURNING id, password_reset_code_hash`,
      [normalizedEmail, MAX_PASSWORD_RESET_ATTEMPTS],
    );

    const pending = rows[0];

    if (!pending || !passwordResetCodeMatches(code.trim(), pending.password_reset_code_hash)) {
      return reply.code(400).send(invalid);
    }

    const passwordHash = await hashPassword(password);

    // Uslov na isti otisak: od dva istovremena zahtjeva sa ispravnim
    // kodom prolazi samo jedan — kod je jednokratan i pod trkom.
    //
    // Nalog se ujedno potvrdjuje: ko je dobio kod na ovu adresu, dokazao
    // je da je adresa njegova, isto kao kod potvrde emaila.
    const { rowCount } = await pool.query(
      `UPDATE accounts
       SET password_hash = $3,
           password_changed_at = now(),
           password_reset_code_hash = NULL,
           password_reset_expires_at = NULL,
           password_reset_attempts = 0,
           email_verified = true,
           verification_code_hash = NULL,
           verification_code_expires_at = NULL,
           verification_attempts = 0
       WHERE id = $1 AND password_reset_code_hash = $2`,
      [pending.id, pending.password_reset_code_hash, passwordHash],
    );

    if (!rowCount) {
      return reply.code(400).send(invalid);
    }

    return reply.send({ ok: true });
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
