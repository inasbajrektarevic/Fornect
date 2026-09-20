// Fleet / OTA modul — Zadatak 1, Tačka 6, tačka 5.
//
// Alen: „Bez ovog modula OTA u produkciji ne kreće." Njegov spisak ima
// pet stavki; ovdje su četiri:
//
//   inventar verzija po uređajima      — GET /app/fleet
//   prstenovi rolloutu                 — PUT /app/fleet/:id/ota
//   kill-switch za pauziranje          — PUT /app/fleet/:id/ota
//   rollback po uređaju                — POST /app/fleet/:id/lists/rollback
//
// Peta, health dashboard (stopa blokiranja, Squid error rate,
// boot-counter), NIJE ovdje i to je namjerno. Uređaj te brojke danas ne
// šalje — `device_heartbeats.payload` je prazan objekat. Ekran koji ih
// crta bio bi ekran koji crta nule, a panel koji pokazuje izmišljen
// broj je gori od panela koji tu brojku nema: na osnovu izmišljenog
// broja neko donese odluku.
//
// Šta je ovdje „stvarno", a šta čeka uređaj:
//
//   Prozor održavanja, prsten i pauza putuju kroz device_configs kanal
//   koji uređaj VEĆ povlači i potvrđuje (GET /devices/:id/config).
//   Cloud je strana koja o njima odlučuje, pa su potpuni čim ih panel
//   snimi — ništa se ne čeka osim agenta koji ih pročita.
//
//   Verzije su obrnuto: uređaj je strana koja o njima zna. Dok ih ne
//   pošalje u heartbeat-u, panel piše da ih uređaj ne prijavljuje.

import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

import { pool } from '../db';
import { env } from '../env';
import { syncDeviceConfig } from '../services/device-config-sync';

interface OtaBody {
  ota_ring?: string;
  ota_paused?: boolean;
  maintenance_start?: string;
  maintenance_end?: string;
}

interface ListsBody {
  urls?: unknown;
  label?: string;
}

interface BulkBody {
  action?: string;
  ring?: string | null;
  expected_urls?: unknown[];
}

const RINGS = ['bench', 'early', 'half', 'all'];

// Gornja granica je gruba, ali postoji s razlogom: svaki URL je jedan
// download koji uređaj radi na svakom osvježavanju lista.
const MAX_URLS = 20;

// Izvori sa kojih se povlači direktno. Ne odbijamo ih — na klupi su
// legitimni — nego uz odgovor ide upozorenje, jer Tačka 6 kaže da
// 10.000 uređaja na ovim adresama znači rate-limit i da za produkciju
// ide naš mirror.
const DIRECT_SOURCES = ['raw.githubusercontent.com', 'github.com', 'gitlab.com'];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function fleetRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/fleet', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.kind,
         d.mode,
         d.ota_ring,
         d.ota_paused,
         to_char(d.maintenance_start, 'HH24:MI') AS maintenance_start,
         to_char(d.maintenance_end, 'HH24:MI') AS maintenance_end,
         d.reported_versions,
         d.reported_versions_at,
         d.last_seen_at,
         (d.last_seen_at IS NOT NULL
           AND d.last_seen_at > now() - (interval '1 minute' * $2)) AS online,
         (SELECT row_to_json(s) FROM (
            SELECT fls.id, fls.label, fls.urls, fls.source, fls.created_at
            FROM filter_list_sets fls
            WHERE fls.device_id = d.id
            ORDER BY fls.created_at DESC, fls.id DESC
            LIMIT 1
          ) s) AS active_list,
         -- Da li uopšte IMA na šta da se vrati. Dugme za rollback koje
         -- ne može ništa vratiti ne smije biti aktivno.
         (SELECT count(*)::int > 1 FROM filter_list_sets fls
          WHERE fls.device_id = d.id) AS can_rollback,
         (SELECT max(version) FROM device_configs dc WHERE dc.device_id = d.id)
           AS config_version,
         (SELECT max(version) FROM device_configs dc
          WHERE dc.device_id = d.id AND dc.acked_at IS NOT NULL) AS acked_version
       FROM devices d
       WHERE d.claimed_by_account_id = $1
       ORDER BY d.created_at ASC`,
      [request.accountId, env.deviceOnlineThresholdMinutes],
    );

    return reply.send(rows);
  });

  fastify.put<{ Params: { id: string }; Body: OtaBody }>(
    '/fleet/:id/ota',
    async (request, reply) => {
      const body = request.body ?? {};

      if (body.ota_ring !== undefined && !RINGS.includes(body.ota_ring)) {
        return reply.code(400).send({ error: `ota_ring mora biti jedno od: ${RINGS.join(', ')}.` });
      }

      for (const field of ['maintenance_start', 'maintenance_end'] as const) {
        const value = body[field];

        if (value !== undefined && !TIME_PATTERN.test(value)) {
          return reply.code(400).send({ error: `${field} mora biti u obliku HH:MM.` });
        }
      }

      // Prozor koji počinje i završava u isto vrijeme nije prozor.
      // Prozor preko ponoći (23:00–03:00) JESTE legitiman i dozvoljen —
      // održavanje se i radi noću — pa se ne traži start < end.
      if (
        body.maintenance_start !== undefined &&
        body.maintenance_end !== undefined &&
        body.maintenance_start === body.maintenance_end
      ) {
        return reply.code(400).send({ error: 'Prozor održavanja ne smije biti nulte dužine.' });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const { rows } = await client.query<{ id: string }>(
          `UPDATE devices
           SET ota_ring = COALESCE($3, ota_ring),
               ota_paused = COALESCE($4, ota_paused),
               maintenance_start = COALESCE($5::time, maintenance_start),
               maintenance_end = COALESCE($6::time, maintenance_end),
               updated_at = now()
           WHERE id = $1 AND claimed_by_account_id = $2
           RETURNING id`,
          [
            request.params.id,
            request.accountId,
            body.ota_ring ?? null,
            body.ota_paused ?? null,
            body.maintenance_start ?? null,
            body.maintenance_end ?? null,
          ],
        );

        if (!rows[0]) {
          await client.query('ROLLBACK');

          return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
        }

        await syncDeviceConfig(client, request.accountId!, request.params.id);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        throw error;
      } finally {
        client.release();
      }

      return reply.send(await loadOne(request.accountId!, request.params.id));
    },
  );

  fastify.get<{ Params: { id: string } }>('/fleet/:id/lists', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT fls.id, fls.label, fls.urls, fls.source, fls.restored_from, fls.created_at
       FROM filter_list_sets fls
       JOIN devices d ON d.id = fls.device_id
       WHERE fls.device_id = $1 AND d.claimed_by_account_id = $2
       ORDER BY fls.created_at DESC, fls.id DESC
       LIMIT 50`,
      [request.params.id, request.accountId],
    );

    return reply.send(rows);
  });

  fastify.put<{ Params: { id: string }; Body: ListsBody }>(
    '/fleet/:id/lists',
    async (request, reply) => {
      const body = request.body ?? {};

      if (!Array.isArray(body.urls)) {
        return reply.code(400).send({ error: 'urls mora biti niz.' });
      }

      const urls: string[] = [];

      for (const entry of body.urls) {
        if (typeof entry !== 'string') {
          continue;
        }

        const url = entry.trim();

        if (!url) {
          continue;
        }

        // Samo https. Lista koja se povlači preko http-a je lista koju
        // neko na putu može zamijeniti — a ona određuje šta se blokira,
        // dakle i šta se NE blokira.
        if (!/^https:\/\//i.test(url)) {
          return reply.code(400).send({ error: `URL mora počinjati sa https:// — ${url}` });
        }

        if (!urls.includes(url)) {
          urls.push(url);
        }
      }

      if (urls.length > MAX_URLS) {
        return reply.code(400).send({ error: `Najviše ${MAX_URLS} lista po uređaju.` });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const { rows: owned } = await client.query<{ id: string }>(
          'SELECT id FROM devices WHERE id = $1 AND claimed_by_account_id = $2',
          [request.params.id, request.accountId],
        );

        if (!owned[0]) {
          await client.query('ROLLBACK');

          return reply.code(404).send({ error: 'Uređaj nije pronađen.' });
        }

        await client.query(
          `INSERT INTO filter_list_sets (device_id, urls, label, source)
           VALUES ($1, $2::jsonb, $3, 'panel')`,
          [request.params.id, JSON.stringify(urls), body.label?.trim() || null],
        );

        await syncDeviceConfig(client, request.accountId!, request.params.id);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        throw error;
      } finally {
        client.release();
      }

      const warnings = urls.filter((url) => DIRECT_SOURCES.some((host) => url.includes(host)));

      return reply.send({
        ...((await loadOne(request.accountId!, request.params.id)) ?? {}),
        direct_source_warnings: warnings,
      });
    },
  );

  // Jedan klik, jedan red. Vraćanje NE briše set na koji se žalilo —
  // upisuje novi red sa starim URL-ovima. Poslije incidenta se pita
  // „šta je bilo aktivno i od kada"; brisanje bi upravo taj odgovor
  // uklonilo.
  //
  // Vraća se na PRETHODNI red, pa dva uzastopna klika vrate tamo odakle
  // se krenulo. To je namjerno: „vrati prethodni" znači tačno to, a
  // historija pokaže oba koraka. Pametnije ponašanje (npr. „vrati se na
  // posljednji koji nije rollback") bilo bi teže objasniti čovjeku koji
  // gasi požar u tri ujutro.
  fastify.post<{ Params: { id: string } }>(
    '/fleet/:id/lists/rollback',
    async (request, reply) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const outcome = await rollbackHubLists(client, request.accountId!, request.params.id);

        if (outcome.status !== 'applied') {
          await client.query('ROLLBACK');

          return reply.code(409).send({ error: outcome.reason });
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        throw error;
      } finally {
        client.release();
      }

      return reply.send(await loadOne(request.accountId!, request.params.id));
    },
  );

  // Grupne komande — Tačka 6: „kill-switch za pauziranje rolloutu, i
  // rollback komande po uređaju/grupi".
  //
  // Grupa je prsten (bench / early / half / all) ili cijeli nalog.
  //
  // Pauza i nastavak su jednostavni: isto stanje za svaki uređaj u grupi.
  //
  // Rollback NIJE „vrati prethodni svima". To bi bilo opasno: loša lista
  // ne stigne uvijek do cijele grupe, a „prethodni" na uređaju koji je
  // nikad nije dobio poništio bi neku DOBRU izmjenu — tiho, u sred
  // incidenta, kad niko ne gleda pojedinačne uređaje. Zato grupni
  // rollback znači „poništi OVAJ set gdje god je aktivan": pozivalac šalje
  // URL-ove seta koji poništava, a uređaji na kojima je aktivan neki drugi
  // set se preskaču i to se kaže.
  //
  // Odgovor nosi ishod za SVAKI uređaj. „Urađeno" bez spiska bi sakrilo
  // upravo one uređaje koji su preskočeni — a o njima se najviše pita.
  fastify.post<{ Body: BulkBody }>('/fleet/bulk', async (request, reply) => {
    const body = request.body ?? {};
    const action = body.action;

    if (action !== 'pause' && action !== 'resume' && action !== 'rollback-lists') {
      return reply.code(400).send({ error: 'action mora biti pause, resume ili rollback-lists.' });
    }

    const ring = body.ring ?? null;

    if (ring !== null && !RINGS.includes(ring)) {
      return reply.code(400).send({ error: `ring mora biti jedno od: ${RINGS.join(', ')}.` });
    }

    let expected: string | null = null;

    if (action === 'rollback-lists') {
      if (!Array.isArray(body.expected_urls) || body.expected_urls.length === 0) {
        return reply.code(400).send({
          error: 'Za grupni rollback treba navesti koji se set poništava (expected_urls).',
        });
      }

      expected = setKey(body.expected_urls);
    }

    const client = await pool.connect();
    const results: BulkOutcome[] = [];

    try {
      await client.query('BEGIN');

      // FOR UPDATE: dvije grupne komande koje stignu jedna preko druge
      // (npr. dva prozora panela) ne smiju obje vidjeti isto početno
      // stanje i obje ga „promijeniti".
      const { rows: hubs } = await client.query<{
        id: string;
        name: string;
        ota_paused: boolean;
      }>(
        `SELECT id, name, ota_paused
         FROM devices
         WHERE claimed_by_account_id = $1
           AND ($2::text IS NULL OR ota_ring = $2)
         ORDER BY created_at ASC
         FOR UPDATE`,
        [request.accountId, ring],
      );

      for (const hub of hubs) {
        if (action === 'rollback-lists') {
          const outcome = await rollbackHubLists(client, request.accountId!, hub.id, expected);

          results.push({ device_id: hub.id, name: hub.name, ...outcome });

          continue;
        }

        const paused = action === 'pause';

        if (hub.ota_paused === paused) {
          results.push({ device_id: hub.id, name: hub.name, status: 'unchanged' });

          continue;
        }

        await client.query('UPDATE devices SET ota_paused = $2, updated_at = now() WHERE id = $1', [
          hub.id,
          paused,
        ]);

        await syncDeviceConfig(client, request.accountId!, hub.id);

        results.push({ device_id: hub.id, name: hub.name, status: 'applied' });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');

      throw error;
    } finally {
      client.release();
    }

    return reply.send({ action, ring, results });
  });
}

type SkipCode = 'other-set-active' | 'no-previous-set';

type BulkOutcome = {
  device_id: string;
  name: string;
  status: 'applied' | 'unchanged' | 'skipped';
  // Kod je za panel, koji ga prevodi; tekst je za svakog drugog ko
  // čita odgovor (log, curl). Samo tekst bi panel na engleskom
  // natjerao da prikazuje bosanski.
  reason_code?: SkipCode;
  reason?: string;
};

type RollbackOutcome =
  | { status: 'applied' }
  | { status: 'skipped'; reason_code: SkipCode; reason: string };

/**
 * Vraća prethodni set filter lista na jednom hub-u.
 *
 * Jedino mjesto sa ovim pravilom — zovu ga i pojedinačna i grupna ruta.
 *
 * `expectedKey` postoji samo kod grupnog rollbacka: vraća se SAMO ako je
 * na hub-u trenutno aktivan baš set koji se poništava. Kod pojedinačnog
 * je čovjek pogledao taj uređaj i odlučio, pa provjera ne treba.
 */
async function rollbackHubLists(
  client: PoolClient,
  accountId: string,
  deviceId: string,
  expectedKey: string | null = null,
): Promise<RollbackOutcome> {
  const { rows } = await client.query<{
    id: string;
    urls: string[];
    label: string | null;
  }>(
    `SELECT fls.id, fls.urls, fls.label
     FROM filter_list_sets fls
     JOIN devices d ON d.id = fls.device_id
     WHERE fls.device_id = $1 AND d.claimed_by_account_id = $2
     ORDER BY fls.created_at DESC, fls.id DESC
     LIMIT 2`,
    [deviceId, accountId],
  );

  const [active, previous] = rows;

  if (expectedKey !== null && (!active || setKey(active.urls) !== expectedKey)) {
    return {
      status: 'skipped',
      reason_code: 'other-set-active',
      reason: 'Na uređaju je aktivan drugi set lista.',
    };
  }

  if (!previous) {
    return {
      status: 'skipped',
      reason_code: 'no-previous-set',
      reason: 'Nema ranijeg seta lista na koji bi se moglo vratiti.',
    };
  }

  await client.query(
    `INSERT INTO filter_list_sets (device_id, urls, label, source, restored_from)
     VALUES ($1, $2::jsonb, $3, 'rollback', $4)`,
    [deviceId, JSON.stringify(previous.urls), previous.label, previous.id],
  );

  await syncDeviceConfig(client, accountId, deviceId);

  return { status: 'applied' };
}

/**
 * Ključ po kojem se prepoznaje „isti set": isti URL-ovi, bez obzira na
 * redoslijed. Oznaka se ne računa — dva seta sa istim listama a drugačijim
 * imenom jesu isti set sa stanovišta uređaja.
 */
function setKey(urls: unknown[]): string {
  return JSON.stringify(
    urls
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.trim())
      .sort(),
  );
}

// Povratni tip je namjerno Record, a ne `unknown`: odgovor se na
// jednom mjestu širi zajedno sa upozorenjima o listama, a `unknown` se
// ne može širiti.
async function loadOne(
  accountId: string,
  deviceId: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT
       d.id,
       d.name,
       d.ota_ring,
       d.ota_paused,
       to_char(d.maintenance_start, 'HH24:MI') AS maintenance_start,
       to_char(d.maintenance_end, 'HH24:MI') AS maintenance_end,
       d.reported_versions,
       d.reported_versions_at,
       (SELECT row_to_json(s) FROM (
          SELECT fls.id, fls.label, fls.urls, fls.source, fls.created_at
          FROM filter_list_sets fls
          WHERE fls.device_id = d.id
          ORDER BY fls.created_at DESC, fls.id DESC
          LIMIT 1
        ) s) AS active_list,
       (SELECT count(*)::int > 1 FROM filter_list_sets fls
        WHERE fls.device_id = d.id) AS can_rollback,
       (SELECT max(version) FROM device_configs dc WHERE dc.device_id = d.id)
         AS config_version,
       -- Mora biti i ovdje, ne samo u listi. Panel odgovor spaja sa
       -- postojećom karticom, a polje koje nedostaje pretvori u null:
       -- uređaj koji JESTE potvrdio postavke ispao bi kao da nije.
       (SELECT max(version) FROM device_configs dc
        WHERE dc.device_id = d.id AND dc.acked_at IS NOT NULL) AS acked_version
     FROM devices d
     WHERE d.id = $1 AND d.claimed_by_account_id = $2`,
    [deviceId, accountId],
  );

  return rows[0];
}
