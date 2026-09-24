// Pristanak na presretanje saobraćaja (puna zaštita / MITM).
//
// Tok prati Zadatak 1, Tačka 5:
//
//   1. Korisnik popuni formu pristanka  → POST .../consent
//      Uređaj prelazi u 'pairing', zapisuje se ko je dao pristanak.
//   2. Korisnik instalira CA certifikat po uputstvu za svoj OS.
//   3. Uređaj tehnički dokaže da vjeruje našem CA → POST .../consent/verify
//      Tek tada uređaj postaje 'paired' i ulazi u consented_macs.
//   4. Opoziv u bilo kom trenutku → POST .../consent/revoke
//
// Ključna razlika u odnosu na raniju verziju panela: pristanak više
// nije deklarativan ("kliknuo sam da sam instalirao") nego dokazan —
// `verified_at` se popunjava samo kad handshake stvarno prođe.
//
// Same radnje (davanje, provjera, opoziv) stoje u
// services/consent-actions.ts, jer do istog ishoda sada vode dva puta:
// ove rute iz panela i eventi koje šalje hub (routes/device-events.ts).
// Dva puta smiju postojati; dva različita pravila o istom pristanku ne
// smiju.

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';

import {
  grantConsent,
  loadDeviceForUpdate,
  revokeConsent,
  verifyConsent,
  type ConsentDeviceRow,
  type ConsentRecordRow,
  type ConsentResult,
} from '../services/consent-actions';

import { CONSENT_POLICY_VERSION } from '../services/consent-policy';

interface GrantBody {
  guardian_name?: string;
  guardian_relation?: string;
  subject_is_minor?: boolean;
  method?: ConsentRecordRow['method'];
  ca_fingerprint?: string;
}

interface VerifyBody {
  success?: boolean;
  error?: string;
  manual?: boolean;
}

interface RevokeBody {
  reason?: string;
}

/**
 * Zajednički okvir za sve tri radnje: transakcija, zaključavanje
 * uređaja, prevođenje ishoda u status kod. Uređaj se uvijek traži i po
 * `account_id` — tuđi pristanak se ne smije ni pročitati ni promijeniti.
 */
async function withDevice(
  deviceId: string,
  accountId: string,
  reply: FastifyReply,
  action: (client: PoolClient, device: ConsentDeviceRow) => Promise<ConsentResult>,
  successCode = 200,
): Promise<FastifyReply> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const device = await loadDeviceForUpdate(client, deviceId, accountId);

    if (!device) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
    }

    const result = await action(client, device);

    if (!result.ok) {
      await client.query('ROLLBACK');
      return reply.code(result.code).send({ error: result.error });
    }

    await client.query('COMMIT');

    return reply.code(successCode).send(result.record);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function consentRoutes(fastify: FastifyInstance): Promise<void> {
  // Trenutna verzija politike — panel je čita da bi znao da li uređaj
  // sa starijom prihvaćenom verzijom treba ponovo pitati.
  fastify.get('/consent-policy', async (_request, reply) =>
    reply.send({ policy_version: CONSENT_POLICY_VERSION }),
  );

  // Cijeli trag pristanaka naloga — uključujući opozvane. Ovo je
  // revizijski zapis, pa se namjerno ne filtrira na aktivne.
  fastify.get('/consent-records', async (request, reply) => {
    const { rows } = await pool.query<ConsentRecordRow>(
      `SELECT * FROM consent_records
       WHERE account_id = $1
       ORDER BY granted_at DESC`,
      [request.accountId],
    );

    return reply.send(rows);
  });

  // Aktivan pristanak za jedan uređaj + njegova istorija + podaci o
  // CA certifikatu hub-a sa kojim je uređaj uparen.
  fastify.get<{ Params: { id: string } }>(
    '/network-devices/:id/consent',
    async (request, reply) => {
      const { rows } = await pool.query<ConsentRecordRow>(
        `SELECT * FROM consent_records
         WHERE network_device_id = $1 AND account_id = $2
         ORDER BY granted_at DESC`,
        [request.params.id, request.accountId],
      );

      // Otisak se čita iz hub-a, ne iz zapisa pristanka: hub je taj
      // koji drži certifikat, a korisnik ga mora moći uporediti i
      // prije nego što pristanak uopšte da.
      const { rows: caRows } = await pool.query<{
        ca_fingerprint_sha256: string | null;
      }>(
        `SELECT d.ca_fingerprint_sha256
         FROM network_devices nd
         JOIN devices d ON d.id = nd.fornect_device_id
         WHERE nd.id = $1 AND nd.account_id = $2`,
        [request.params.id, request.accountId],
      );

      return reply.send({
        active: rows.find((row) => row.revoked_at === null) ?? null,
        history: rows,
        policy_version: CONSENT_POLICY_VERSION,
        ca_fingerprint: caRows[0]?.ca_fingerprint_sha256 ?? null,
      });
    },
  );

  // Preuzimanje javnog CA certifikata hub-a, da ga korisnik može
  // instalirati na uređaj. Vraća se kao fajl, pa ga browser snimi
  // umjesto da ga prikaže kao tekst.
  fastify.get<{ Params: { id: string } }>(
    '/network-devices/:id/ca',
    async (request, reply) => {
      const { rows } = await pool.query<{
        ca_certificate_pem: string | null;
      }>(
        `SELECT d.ca_certificate_pem
         FROM network_devices nd
         JOIN devices d ON d.id = nd.fornect_device_id
         WHERE nd.id = $1 AND nd.account_id = $2`,
        [request.params.id, request.accountId],
      );

      const pem = rows[0]?.ca_certificate_pem;

      if (!pem) {
        return reply.code(404).send({
          error:
            'Hub još nije prijavio svoj certifikat, pa nema šta preuzeti.',
        });
      }

      return reply
        .header('Content-Type', 'application/x-pem-file')
        .header(
          'Content-Disposition',
          'attachment; filename="fornect-ca.crt"',
        )
        .send(pem);
    },
  );

  // Korak 1 — davanje pristanka.
  fastify.post<{ Params: { id: string }; Body: GrantBody }>(
    '/network-devices/:id/consent',
    async (request, reply) => {
      const body = request.body ?? {};

      return withDevice(request.params.id, request.accountId!, reply, (client, device) =>
        grantConsent(client, device, {
          guardianName: body.guardian_name ?? '',
          guardianRelation: body.guardian_relation ?? '',
          subjectIsMinor: body.subject_is_minor,
          method: body.method ?? 'panel',
          caFingerprint: body.ca_fingerprint ?? null,
        }),
        201,
      );
    },
  );

  // Korak 3 — rezultat tehničke provjere certifikata.
  //
  // Rezultat zna samo uređaj, jer samo on vidi da li je TLS handshake
  // kroz Squid uspio. Kad hub proradi, isto ovo radi event
  // consent.verify_failed odnosno device.classified — ova ruta ostaje
  // za ručnu potvrdu iz panela ("instalirao sam"), koja se u tragu
  // označava kao `manual`.
  fastify.post<{ Params: { id: string }; Body: VerifyBody }>(
    '/network-devices/:id/consent/verify',
    async (request, reply) => {
      const body = request.body ?? {};

      return withDevice(request.params.id, request.accountId!, reply, (client, device) =>
        verifyConsent(client, device, {
          success: body.success === true,
          error: body.error,
          manual: body.manual,
        }),
      );
    },
  );

  // Korak 4 — opoziv pristanka.
  fastify.post<{ Params: { id: string }; Body: RevokeBody }>(
    '/network-devices/:id/consent/revoke',
    async (request, reply) => {
      return withDevice(request.params.id, request.accountId!, reply, (client, device) =>
        revokeConsent(client, device, request.body?.reason),
      );
    },
  );
}
