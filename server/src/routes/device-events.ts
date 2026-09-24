// POST /api/v1/devices/:id/events — hub javlja šta se desilo na mreži.
//
// Kontrakt je iz Zadatka 1, Tačka 5, i doslovno kaže da su ovi eventi
// ulaz za red "Novi uređaji": device.new, device.classified,
// consent.revoked, consent.verify_failed. Red je u panelu postojao od
// ranije, ali ga je punio isključivo panel — hub je mogao vidjeti
// nepoznat uređaj na mreži a da vlasnik za njega nikad ne sazna.
//
// Tri stvari koje ova ruta radi drugačije nego obična POST ruta:
//
//   Prima paket, ne jedan event. Hub koji je bio bez veze ima zaostatak
//   i mora ga moći poslati odjednom.
//
//   Svaki event se pamti po `event_id` koji je dao uređaj. Mreža pada,
//   pa uređaj koji ne dobije odgovor MORA smjeti poslati isto ponovo;
//   bez ovoga bi ponovljeni consent.revoked opozvao pristanak koji je
//   korisnik u međuvremenu ponovo dao.
//
//   Neispravan event ne obara paket. Odgovor kaže za svaki event šta
//   je s njim bilo, jer uređaj koji dobije 400 na cijeli paket nema
//   kako da zna koji ga je event potopio, pa bi ga slao u krug.

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';
import { authenticateDevice } from '../plugins/authenticate-device';

import {
  grantConsent,
  loadDeviceForUpdate,
  revokeConsent,
  verifyConsent,
  type ConsentDeviceRow,
} from '../services/consent-actions';

import { normaliseMac } from '../services/mac';
import { recordNewDeviceNotice, syncCapacityNotice } from '../services/notifications';

type EventType =
  | 'device.new'
  | 'device.classified'
  | 'consent.revoked'
  | 'consent.verify_failed';

interface HubEvent {
  event_id?: string;
  type?: string;
  mac?: string;
  at?: string;
  name?: string;
  device_type?: 'phone' | 'tv' | 'console' | 'unknown';
  state?: 'guest' | 'consented';
  method?: 'portal' | 'panel' | 'auto';
  consent?: {
    guardian_name?: string;
    guardian_relation?: string;
    subject_is_minor?: boolean;
    ca_fingerprint?: string;
  };
  reason?: string;
  error?: string;
}

interface EventsBody {
  events?: unknown;
}

interface EventOutcome {
  event_id: string;
  status: 'applied' | 'duplicate' | 'rejected';
  reason?: string;
}

const KNOWN_TYPES: EventType[] = [
  'device.new',
  'device.classified',
  'consent.revoked',
  'consent.verify_failed',
];

// Paket koji je prevelik znači da je hub predugo bio bez veze; bolje
// da ga pošalje u dijelovima nego da jedna transakcija drži bazu.
const MAX_EVENTS_PER_BATCH = 200;

export async function deviceEventRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string }; Body: EventsBody }>(
    '/:id/events',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const hub = request.device!;

      const raw = request.body?.events;

      if (!Array.isArray(raw)) {
        return reply.code(400).send({ error: 'events mora biti niz.' });
      }

      if (raw.length > MAX_EVENTS_PER_BATCH) {
        return reply
          .code(413)
          .send({ error: `Najviše ${MAX_EVENTS_PER_BATCH} eventa po paketu.` });
      }

      if (!hub.claimed_by_account_id) {
        // Hub koji nije uparen nema čijem nalogu da pripiše uređaj.
        // 409, ne 400: paket je ispravan, samo je preuranjen — uređaj
        // ga smije ponoviti kad ga korisnik upari.
        return reply
          .code(409)
          .send({ error: 'Uređaj još nije uparen ni sa jednim nalogom.' });
      }

      const accountId = hub.claimed_by_account_id;
      const outcomes: EventOutcome[] = [];

      for (const item of raw as HubEvent[]) {
        outcomes.push(await applyEvent(hub.id, accountId, item));
      }

      return reply.send({ ok: true, results: outcomes });
    },
  );
}

/**
 * Jedan event = jedna transakcija.
 *
 * Namjerno nije cijeli paket u jednoj: ako deseti event ima grešku,
 * prvih devet su se stvarno desili na mreži i nema razloga da se
 * ponište.
 */
async function applyEvent(
  hubId: string,
  accountId: string,
  event: HubEvent,
): Promise<EventOutcome> {
  const eventId = event.event_id?.trim();
  const type = event.type?.trim() as EventType | undefined;
  const mac = normaliseMac(event.mac);

  if (!eventId) {
    return { event_id: '', status: 'rejected', reason: 'event_id je obavezan.' };
  }

  if (!type || !KNOWN_TYPES.includes(type)) {
    return { event_id: eventId, status: 'rejected', reason: 'Nepoznat tip eventa.' };
  }

  if (!mac) {
    return {
      event_id: eventId,
      status: 'rejected',
      reason: 'mac je obavezan i mora biti MAC adresa (aa:bb:cc:dd:ee:ff).',
    };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Zapis ide PRIJE obrade i sam radi kao brava: drugi pokušaj sa
    // istim event_id ne prođe dalje od ovog INSERT-a.
    const { rows: ledger } = await client.query<{ id: string }>(
      `INSERT INTO device_events (device_id, event_id, type, mac_address, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (device_id, event_id) DO NOTHING
       RETURNING id`,
      [hubId, eventId, type, mac, JSON.stringify(event)],
    );

    if (!ledger[0]) {
      await client.query('ROLLBACK');
      return { event_id: eventId, status: 'duplicate' };
    }

    const reason = await handle(client, hubId, accountId, type, mac, event);

    if (reason) {
      // Odbijeni event ostaje zapisan sa razlogom. Uređaj ga neće
      // ponoviti (event_id je potrošen), ali se poslije može vidjeti
      // šta je i zašto propalo.
      await client.query('UPDATE device_events SET rejected_reason = $2 WHERE id = $1', [
        ledger[0].id,
        reason,
      ]);

      await client.query('COMMIT');

      return { event_id: eventId, status: 'rejected', reason };
    }

    await client.query('COMMIT');

    return { event_id: eventId, status: 'applied' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Vraća razlog odbijanja, ili null ako je event primijenjen. */
async function handle(
  client: PoolClient,
  hubId: string,
  accountId: string,
  type: EventType,
  mac: string,
  event: HubEvent,
): Promise<string | null> {
  if (type === 'device.new') {
    return handleNewDevice(client, hubId, accountId, mac, event);
  }

  const device = await loadDeviceByMac(client, accountId, mac);

  if (!device) {
    return 'Uređaj sa ovom MAC adresom nije zaveden na nalogu.';
  }

  if (type === 'consent.revoked') {
    const result = await revokeConsent(
      client,
      device,
      event.reason?.trim() || 'Opozvano na uređaju.',
    );

    return result.ok ? null : result.error;
  }

  if (type === 'consent.verify_failed') {
    const result = await verifyConsent(client, device, {
      success: false,
      error: event.error?.trim(),
    });

    return result.ok ? null : result.error;
  }

  return handleClassified(client, device, event);
}

/**
 * Nov uređaj na mreži.
 *
 * Ulazi kao `unpaired` — "niko još nije odlučio" — i time se pojavljuje
 * u redu "Novi uređaji". Ako je već zaveden, event se ne odbija nego se
 * samo osvježi zadnje viđenje: hub koji ponovo digne mrežu legitimno
 * javi sve što vidi, i to nije greška.
 */
async function handleNewDevice(
  client: PoolClient,
  hubId: string,
  accountId: string,
  mac: string,
  event: HubEvent,
): Promise<string | null> {
  const firstSeen = parseDate(event.at);

  const { rowCount } = await client.query(
    `INSERT INTO network_devices
       (account_id, fornect_device_id, mac_address, name, type, pairing_state, created_at)
     VALUES ($1, $2, $3, $4, $5, 'unpaired', coalesce($6::timestamptz, now()))
     ON CONFLICT (account_id, mac_address) DO NOTHING`,
    [
      accountId,
      hubId,
      mac,
      event.name?.trim() || mac,
      event.device_type ?? 'unknown',
      firstSeen,
    ],
  );

  if (rowCount === 0) {
    // Već postoji — javimo hub-u da je uređaj sada online, jer ga
    // upravo vidi na mreži.
    await client.query(
      `UPDATE network_devices SET online = true
       WHERE account_id = $1 AND mac_address = $2`,
      [accountId, mac],
    );

    return null;
  }

  // Nov uređaj može biti onaj koji prelazi kapacitet licence.
  await syncCapacityNotice(client, accountId);

  // I vlasnik o njemu mora saznati bez otvaranja reda „Novi uređaji".
  const { rows: created } = await client.query<{ id: string }>(
    'SELECT id FROM network_devices WHERE account_id = $1 AND mac_address = $2',
    [accountId, mac],
  );

  if (created[0]) {
    await recordNewDeviceNotice(
      client,
      accountId,
      created[0].id,
      mac,
      event.name?.trim() || mac,
    );
  }

  return null;
}

/**
 * Uređaj se izjasnio kroz captive portal.
 *
 * `guest` je osnovna zaštita i tu nema pristanka. `consented` znači da
 * je neko popunio formu pristanka na portalu — i taj pristanak mora
 * nositi ime i odnos davaoca, inače zapis ne vrijedi kao dokaz i event
 * se odbija. Potvrda da certifikat stvarno radi ne dolazi odavde nego
 * kasnije, kroz provjeru: uređaj ostaje u `pairing` dok se to ne desi.
 */
async function handleClassified(
  client: PoolClient,
  device: ConsentDeviceRow,
  event: HubEvent,
): Promise<string | null> {
  if (event.state === 'guest') {
    await client.query(
      `UPDATE network_devices
       SET pairing_state = 'guest',
           use_full_protection = false,
           protection_level = 'standard'
       WHERE id = $1`,
      [device.id],
    );

    return null;
  }

  if (event.state !== 'consented') {
    return 'state mora biti guest ili consented.';
  }

  const result = await grantConsent(client, device, {
    guardianName: event.consent?.guardian_name ?? '',
    guardianRelation: event.consent?.guardian_relation ?? '',
    subjectIsMinor: event.consent?.subject_is_minor,
    // Uređaj smije reći da je pristanak dat kroz portal ili automatski;
    // 'manual' je rezervisano za ručnu potvrdu čovjeka u panelu i
    // uređaj ga ne smije tvrditi o sebi.
    method: event.method === 'auto' ? 'auto' : 'portal',
    caFingerprint: event.consent?.ca_fingerprint ?? null,
  });

  return result.ok ? null : result.error;
}

async function loadDeviceByMac(
  client: PoolClient,
  accountId: string,
  mac: string,
): Promise<ConsentDeviceRow | undefined> {
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM network_devices WHERE account_id = $1 AND mac_address = $2',
    [accountId, mac],
  );

  if (!rows[0]) {
    return undefined;
  }

  return loadDeviceForUpdate(client, rows[0].id, accountId);
}

function parseDate(value?: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
