// Rute koje zove sam Fornect uređaj (Orange Pi agent): registracija,
// heartbeat, i povlačenje/potvrda konfiguracije. Autentifikacija je
// preko Bearer tokena (authenticateDevice), osim register-a, koji se
// zove prije nego uređaj uopšte ima token.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { authenticateDevice } from '../plugins/authenticate-device';
import { generateDeviceToken, hashDeviceToken } from '../services/device-tokens';
import { generatePairingCode, PAIRING_CODE_TTL_MINUTES } from '../services/hub-pairing';

import {
  getAccountTimeZone,
  recordPresenceChange,
  syncCapacityNotice,
  type PresenceDeviceRow,
} from '../services/notifications';

import type { DeviceRow } from '../types';

interface RegisterBody {
  name?: string;
  kind?: 'home' | 'pro';
  mode?: 'home' | 'hospitality' | 'agency';
  capacity?: number;
}

interface HeartbeatBody {
  stats?: Record<string, unknown>;
}

interface ConfigAckBody {
  version?: number;
}

interface CaBody {
  certificate_pem?: string;
  fingerprint_sha256?: string;
}

interface PresenceBody {
  macs?: unknown;
}

interface PresenceRow extends PresenceDeviceRow {
  mac_address: string;
}

export async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>(
    '/register',
    {
      // Ruta je namjerno bez auth-a (uređaj još nema token), pa je
      // rate limit po IP-u osnovna zaštita dok se mrežni nivo zaštite
      // (VPN/allowlist) ne postavi odvojeno na VPS-u.
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const { name, kind = 'home', mode = 'home', capacity } = request.body ?? {};

      if (!name) {
        return reply.code(400).send({ error: 'name je obavezan.' });
      }

      const token = generateDeviceToken();
      const tokenHash = hashDeviceToken(token);
      const pairingCode = generatePairingCode();

      const { rows } = await pool.query<DeviceRow>(
        `INSERT INTO devices (name, token_hash, kind, mode, capacity, pairing_code, pairing_code_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' minutes')::interval)
       RETURNING *`,
        [name, tokenHash, kind, mode, capacity ?? null, pairingCode, PAIRING_CODE_TTL_MINUTES],
      );

      const device = rows[0]!;

      // Token se vraća SAMO ovdje, jednom — uređaj ga mora sačuvati,
      // jer se ne može ponovo pročitati (u bazi je samo hash).
      // pairing_code se vraća i ovdje (uređaj ga prikazuje na svom
      // ekranu/log-u da ga korisnik unese u app) — za razliku od
      // tokena, može se ponovo zatražiti preko /:id/pairing-code ako
      // istekne prije nego korisnik stigne da ga unese.
      return reply.code(201).send({
        id: device.id,
        name: device.name,
        kind: device.kind,
        mode: device.mode,
        capacity: device.capacity,
        token,
        pairing_code: pairingCode,
        pairing_code_expires_at: device.pairing_code_expires_at,
        created_at: device.created_at,
      });
    },
  );

  // Uređaj traži svjež pairing kod kad prethodni istekne prije nego
  // ga je korisnik stigao unijeti u app (15min TTL). Auth preko
  // Bearer tokena — samo sam uređaj smije regenerisati svoj kod.
  fastify.post(
    '/:id/pairing-code',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;

      if (device.claimed_by_account_id) {
        return reply.code(409).send({ error: 'Uređaj je već uparen sa nalogom.' });
      }

      const pairingCode = generatePairingCode();

      const { rows } = await pool.query<DeviceRow>(
        `UPDATE devices
         SET pairing_code = $2, pairing_code_expires_at = now() + ($3 || ' minutes')::interval
         WHERE id = $1
         RETURNING *`,
        [device.id, pairingCode, PAIRING_CODE_TTL_MINUTES],
      );

      const updated = rows[0]!;

      return reply.send({
        pairing_code: updated.pairing_code,
        pairing_code_expires_at: updated.pairing_code_expires_at,
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body: HeartbeatBody }>(
    '/:id/heartbeat',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;
      const { stats } = request.body ?? {};

      await pool.query(
        `UPDATE devices SET status = 'online', last_seen_at = now(), updated_at = now()
         WHERE id = $1`,
        [device.id],
      );

      await pool.query(
        'INSERT INTO device_heartbeats (device_id, payload) VALUES ($1, $2::jsonb)',
        [device.id, JSON.stringify(stats ?? {})],
      );

      return reply.send({ ok: true, received_at: new Date().toISOString() });
    },
  );

  // Hub javlja koje MAC adrese trenutno vidi na mreži.
  //
  // Ovo je jedini put kojim obavještenje o odlasku sa mreže može
  // nastati dok je aplikacija zatvorena — a to je bio cijeli smisao
  // funkcije. Dok Zadatak 2 ne isporuči agenta koji ovo šalje,
  // prisutnost i dalje javlja panel, pa obavještenje nastaje tek kad
  // neko otvori aplikaciju. Ruta postoji da taj dan ne traži izmjenu
  // ni u jednom drugom fajlu — samo da hub počne slati.
  fastify.post<{ Params: { id: string }; Body: PresenceBody }>(
    '/:id/network-presence',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const hub = request.device!;

      const reported = request.body?.macs;

      if (!Array.isArray(reported)) {
        return reply.code(400).send({ error: 'macs mora biti niz MAC adresa.' });
      }

      if (!hub.claimed_by_account_id) {
        return reply
          .code(409)
          .send({ error: 'Uređaj još nije uparen ni sa jednim nalogom.' });
      }

      const accountId = hub.claimed_by_account_id;

      const present = new Set(
        reported
          .filter((mac): mac is string => typeof mac === 'string')
          .map((mac) => mac.trim().toLowerCase()),
      );

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // FOR UPDATE: prijelaz se računa iz stanja koje se u istoj
        // transakciji mijenja, pa dvije prijave koje stignu jedna
        // preko druge ne mogu obje vidjeti "bio je online".
        const { rows: devices } = await client.query<PresenceRow>(
          `SELECT id, name, profile, online, alert_when_offline, schedule, mac_address
           FROM network_devices
           WHERE account_id = $1 AND fornect_device_id = $2
           FOR UPDATE`,
          [accountId, hub.id],
        );

        const timeZone = await getAccountTimeZone(client, accountId);

        let changed = 0;

        for (const before of devices) {
          const online = present.has(before.mac_address.trim().toLowerCase());

          if (online === before.online) {
            continue;
          }

          await client.query('UPDATE network_devices SET online = $2 WHERE id = $1', [
            before.id,
            online,
          ]);

          await recordPresenceChange(client, accountId, timeZone, before, {
            ...before,
            online,
          });

          changed += 1;
        }

        await syncCapacityNotice(client, accountId);

        await client.query('COMMIT');

        return reply.send({ ok: true, devices: devices.length, changed });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/config',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;

      const { rows } = await pool.query(
        `SELECT version, config_json, created_at
         FROM device_configs
         WHERE device_id = $1
         ORDER BY version DESC
         LIMIT 1`,
        [device.id],
      );

      const latest = rows[0];

      // Uređaj bez ijedne konfiguracije (npr. odmah nakon registracije,
      // prije nego je iko uparen) dobija praznu konfiguraciju verzije 0
      // umjesto 404 — agentu je jednostavnije da uvijek dobije isti oblik.
      if (!latest) {
        return reply.send({ version: 0, config_json: {} });
      }

      return reply.send(latest);
    },
  );

  fastify.post<{ Params: { id: string }; Body: ConfigAckBody }>(
    '/:id/config/ack',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;
      const { version } = request.body ?? {};

      if (typeof version !== 'number') {
        return reply.code(400).send({ error: 'version je obavezan.' });
      }

      const { rowCount } = await pool.query(
        `UPDATE device_configs SET acked_at = now()
         WHERE device_id = $1 AND version = $2`,
        [device.id, version],
      );

      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Ta verzija konfiguracije ne postoji.' });
      }

      return reply.send({ ok: true });
    },
  );

  // Hub prijavljuje JAVNI dio svog CA certifikata. Ključ ostaje na
  // uređaju — vidi komentar uz migraciju 010.
  fastify.post<{ Params: { id: string }; Body: CaBody }>(
    '/:id/ca',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const device = request.device!;
      const { certificate_pem, fingerprint_sha256 } = request.body ?? {};

      if (!certificate_pem || !fingerprint_sha256) {
        return reply
          .code(400)
          .send({ error: 'certificate_pem i fingerprint_sha256 su obavezni.' });
      }

      // Zaštita od najgore moguće greške u agentu: da slučajno ne
      // pošalje privatni ključ umjesto certifikata. Odbijamo ga prije
      // nego dodirne bazu — jednom upisan ključ bi se morao smatrati
      // kompromitovanim.
      if (/PRIVATE KEY/i.test(certificate_pem)) {
        return reply.code(400).send({
          error:
            'Poslan je privatni ključ. Ovdje se prima samo javni certifikat.',
        });
      }

      if (!/BEGIN CERTIFICATE/.test(certificate_pem)) {
        return reply
          .code(400)
          .send({ error: 'certificate_pem nije PEM certifikat.' });
      }

      await pool.query(
        `UPDATE devices
         SET ca_certificate_pem = $2,
             ca_fingerprint_sha256 = $3,
             ca_registered_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [device.id, certificate_pem, fingerprint_sha256],
      );

      return reply.send({ ok: true, fingerprint_sha256 });
    },
  );
}
