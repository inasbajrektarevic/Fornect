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
// NAPOMENA O KORAKU 3: rezultat provjere zna samo uređaj, jer samo on
// vidi da li je TLS handshake kroz Squid uspio. Zato će tu rutu, kad
// hub iz Zadatka 2 proradi, zvati sam uređaj kroz svoju
// device-autentifikovanu putanju. Do tada je ruta pod istim account
// JWT-om kao ostatak panela, da bi tok bio kompletan i testabilan.
// Kad se doda uređaj, mijenja se samo ko je poziva — ni stanje, ni
// zapis, ni panel se ne mijenjaju.

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';
import { CONSENT_POLICY_VERSION } from '../services/consent-policy';
import { syncConsentedMacs } from '../services/device-config-sync';

interface ConsentRecordRow {
  id: string;
  account_id: string;
  network_device_id: string | null;
  mac_address: string;
  device_name: string;
  guardian_name: string;
  guardian_relation: string;
  subject_is_minor: boolean;
  policy_version: string;
  method: 'portal' | 'panel' | 'auto' | 'manual';
  ca_fingerprint: string | null;
  granted_at: string;
  verified_at: string | null;
  verification_failed_at: string | null;
  verification_error: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

// Samo polja koja ovaj modul zaista koristi — puni red živi u
// network-devices.ts i nema razloga da se tip duplira u cjelini.
interface DeviceRow {
  id: string;
  account_id: string;
  fornect_device_id: string | null;
  mac_address: string;
  name: string;
  pairing_state: 'unpaired' | 'guest' | 'pairing' | 'paired' | 'failed';
}

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
  /**
   * Potvrda je došla od čovjeka ("instalirao sam"), a ne od uređaja
   * koji je tehnički dokazao handshake. Tačka 5 traži da se takva
   * potvrda u tragu označi kao `manual`, da se kasnije zna koji su
   * pristanci dokazani a koji samo izjavljeni.
   */
  manual?: boolean;
}

interface RevokeBody {
  reason?: string;
}

const DEVICE_COLUMNS = 'id, account_id, fornect_device_id, mac_address, name, pairing_state';

async function loadDeviceForUpdate(
  client: PoolClient,
  deviceId: string,
  accountId: string,
): Promise<DeviceRow | undefined> {
  const { rows } = await client.query<DeviceRow>(
    `SELECT ${DEVICE_COLUMNS}
     FROM network_devices
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [deviceId, accountId],
  );

  return rows[0];
}

async function loadActiveConsent(
  client: PoolClient,
  deviceId: string,
): Promise<ConsentRecordRow | undefined> {
  const { rows } = await client.query<ConsentRecordRow>(
    `SELECT * FROM consent_records
     WHERE network_device_id = $1 AND revoked_at IS NULL`,
    [deviceId],
  );

  return rows[0];
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

      const guardianName = body.guardian_name?.trim();
      const guardianRelation = body.guardian_relation?.trim();

      // Bez ovoga zapis ne vrijedi kao dokaz pristanka, pa ga ne
      // primamo ni kao nepotpun — prazan potpis je gori od nikakvog.
      if (!guardianName || !guardianRelation) {
        return reply
          .code(400)
          .send({ error: 'guardian_name i guardian_relation su obavezni.' });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const device = await loadDeviceForUpdate(client, request.params.id, request.accountId!);

        if (!device) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
        }

        const active = await loadActiveConsent(client, device.id);

        if (active) {
          // Isti uređaj, ista verzija politike — nema šta da se
          // ponovo prihvata.
          if (active.policy_version === CONSENT_POLICY_VERSION) {
            await client.query('ROLLBACK');
            return reply
              .code(409)
              .send({ error: 'Za ovaj uređaj već postoji važeći pristanak.' });
          }

          // Starija verzija politike — stari pristanak se zatvara sa
          // jasnim razlogom umjesto da se tiho prepiše, da se u tragu
          // vidi zašto je prestao važiti.
          await client.query(
            `UPDATE consent_records
             SET revoked_at = now(), revoked_reason = $2
             WHERE id = $1`,
            [active.id, `Zamijenjen novom verzijom politike (${CONSENT_POLICY_VERSION}).`],
          );
        }

        const { rows: consentRows } = await client.query<ConsentRecordRow>(
          `INSERT INTO consent_records (
             account_id, network_device_id, mac_address, device_name,
             guardian_name, guardian_relation, subject_is_minor,
             policy_version, method, ca_fingerprint
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            request.accountId,
            device.id,
            device.mac_address,
            device.name,
            guardianName,
            guardianRelation,
            body.subject_is_minor ?? false,
            CONSENT_POLICY_VERSION,
            body.method ?? 'panel',
            body.ca_fingerprint ?? null,
          ],
        );

        // Uređaj ulazi u 'pairing': korisnik je pristao, ali još nije
        // dokazao da certifikat radi. Puna zaštita se NE uključuje
        // ovdje — tek nakon uspješne provjere.
        await client.query(
          `UPDATE network_devices
           SET pairing_state = 'pairing',
               use_full_protection = true,
               policy_version = $2
           WHERE id = $1`,
          [device.id, CONSENT_POLICY_VERSION],
        );

        // Ako je uređaj do sada bio 'paired', izlazak iz tog stanja
        // mora se odraziti na consented_macs.
        if (device.pairing_state === 'paired') {
          await syncConsentedMacs(client, device.account_id, device.fornect_device_id);
        }

        await client.query('COMMIT');

        return reply.code(201).send(consentRows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  // Korak 3 — rezultat tehničke provjere certifikata.
  fastify.post<{ Params: { id: string }; Body: VerifyBody }>(
    '/network-devices/:id/consent/verify',
    async (request, reply) => {
      const body = request.body ?? {};
      const success = body.success === true;

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const device = await loadDeviceForUpdate(client, request.params.id, request.accountId!);

        if (!device) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
        }

        const active = await loadActiveConsent(client, device.id);

        // Provjera bez pristanka nema smisla — znači da je neko
        // preskočio korak 1 ili da je pristanak u međuvremenu opozvan.
        if (!active) {
          await client.query('ROLLBACK');
          return reply
            .code(409)
            .send({ error: 'Za ovaj uređaj ne postoji pristanak koji se provjerava.' });
        }

        if (success) {
          // Ručna potvrda se upisuje kao 'manual' da bi se u reviziji
          // razlikovao dokazan pristanak od izjavljenog. Potvrda koja
          // stiže od uređaja ne dira method — ostaje kako je pristanak
          // i dat (portal ili panel).
          await client.query(
            `UPDATE consent_records
             SET verified_at = now(),
                 verification_failed_at = NULL,
                 verification_error = NULL,
                 method = CASE WHEN $2 THEN 'manual' ELSE method END
             WHERE id = $1`,
            [active.id, body.manual === true],
          );

          await client.query(
            `UPDATE network_devices
             SET pairing_state = 'paired', protection_level = 'full'
             WHERE id = $1`,
            [device.id],
          );

          // Tek sada uređaj ulazi u nftables set na hub-u.
          await syncConsentedMacs(client, device.account_id, device.fornect_device_id);
        } else {
          await client.query(
            `UPDATE consent_records
             SET verification_failed_at = now(), verification_error = $2
             WHERE id = $1`,
            [active.id, body.error?.trim() || 'Certifikat nije prepoznat na uređaju.'],
          );

          // 'failed' je namjerno različito od 'unpaired': korisnik
          // jeste dao pristanak, samo instalacija nije prošla — panel
          // na osnovu toga nudi pomoć umjesto da vrati na početak.
          await client.query(
            `UPDATE network_devices SET pairing_state = 'failed' WHERE id = $1`,
            [device.id],
          );
        }

        const { rows } = await client.query<ConsentRecordRow>(
          'SELECT * FROM consent_records WHERE id = $1',
          [active.id],
        );

        await client.query('COMMIT');

        return reply.send(rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  // Korak 4 — opoziv pristanka.
  fastify.post<{ Params: { id: string }; Body: RevokeBody }>(
    '/network-devices/:id/consent/revoke',
    async (request, reply) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const device = await loadDeviceForUpdate(client, request.params.id, request.accountId!);

        if (!device) {
          await client.query('ROLLBACK');
          return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
        }

        const active = await loadActiveConsent(client, device.id);

        if (!active) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Za ovaj uređaj ne postoji važeći pristanak.' });
        }

        await client.query(
          `UPDATE consent_records
           SET revoked_at = now(), revoked_reason = $2
           WHERE id = $1`,
          [active.id, request.body?.reason?.trim() || 'Opozvano iz admin panela.'],
        );

        // Nakon opoziva uređaj je gost: i dalje ima osnovnu (DNS)
        // zaštitu i internet mu radi, ali presretanja više nema.
        // Namjerno ne ide u 'unpaired', jer to stanje znači
        // "neklasifikovan" i uređaj bi ponovo dobijao captive portal.
        await client.query(
          `UPDATE network_devices
           SET pairing_state = 'guest',
               use_full_protection = false,
               protection_level = 'standard',
               policy_version = NULL
           WHERE id = $1`,
          [device.id],
        );

        await syncConsentedMacs(client, device.account_id, device.fornect_device_id);

        const { rows } = await client.query<ConsentRecordRow>(
          'SELECT * FROM consent_records WHERE id = $1',
          [active.id],
        );

        await client.query('COMMIT');

        return reply.send(rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
