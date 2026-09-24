// Nastanak obavještenja — na serveru, a ne u pregledaču.
//
// Ranije je ovo radio panel pri svakom otvaranju liste. Posljedica je
// bila da funkcija koju smo korisniku obećali ("javićemo ti kada
// uređaj napusti mrežu") u stvari nije radila: obavještenje bi nastalo
// tek kada bi roditelj sam otvorio aplikaciju, a ako se uređaj u
// međuvremenu vratio, ne bi nastalo nikad.
//
// Ovdje se razlikuju dvije vrste:
//
//   STANJE — dostignut kapacitet, uređaj trenutno van mreže. Postoji
//   dok traje, i `resolved_at` ga skloni kada prođe.
//
//   DOGAĐAJ — uređaj je napustio mrežu u vrijeme rasporeda. To se
//   desilo u određenom trenutku i ostaje zapisano i nakon što se
//   uređaj vrati, jer je upravo to ono što roditelj ujutro treba da
//   vidi.
//
// Granica onoga što ovo može: server vidi samo da je uređaj nestao sa
// mreže. Ne zna zašto — prazna baterija, isključen wifi i namjerno
// izbjegavanje zaštite izgledaju isto. Ne vidi ni šta uređaj radi
// preko mobilnih podataka. Tekst obavještenja zato ne tvrdi namjeru.

import type { PoolClient } from 'pg';

import { isPausedAt } from './schedule-window';

export type NotificationType =
  | 'offline'
  | 'update'
  | 'protection'
  | 'capacity'
  | 'new-device'
  | 'consent';

export interface NotificationRow {
  id: string;
  account_id: string;
  network_device_id: string | null;
  type: NotificationType;
  title_key: string;
  message_key: string;
  params: Record<string, unknown>;
  dedupe_key: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PresenceDeviceRow {
  id: string;
  name: string;
  profile: string | null;
  online: boolean;
  alert_when_offline: boolean | null;
  schedule: unknown;
}

interface NewNotification {
  type: NotificationType;
  titleKey: string;
  messageKey: string;
  params?: Record<string, unknown>;
  dedupeKey?: string | null;
  networkDeviceId?: string | null;
}

/**
 * Upisuje obavještenje, osim ako isto (po `dedupeKey`) već stoji
 * neriješeno. Sam preskok radi parcijalni unique indeks iz migracije
 * 012, a ne provjera u kodu — dva zahtjeva koja stignu istovremeno ne
 * smiju napraviti dva ista obavještenja.
 */
export async function createNotification(
  client: PoolClient,
  accountId: string,
  notification: NewNotification,
): Promise<NotificationRow | null> {
  const { rows } = await client.query<NotificationRow>(
    `INSERT INTO notifications
       (account_id, network_device_id, type, title_key, message_key, params, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (account_id, dedupe_key)
       WHERE dedupe_key IS NOT NULL AND resolved_at IS NULL
       DO NOTHING
     RETURNING *`,
    [
      accountId,
      notification.networkDeviceId ?? null,
      notification.type,
      notification.titleKey,
      notification.messageKey,
      JSON.stringify(notification.params ?? {}),
      notification.dedupeKey ?? null,
    ],
  );

  return rows[0] ?? null;
}

/** Sklanja obavještenje o stanju koje je prošlo, bez brisanja zapisa. */
export async function resolveNotification(
  client: PoolClient,
  accountId: string,
  dedupeKey: string,
): Promise<void> {
  await client.query(
    `UPDATE notifications
     SET resolved_at = now()
     WHERE account_id = $1 AND dedupe_key = $2 AND resolved_at IS NULL`,
    [accountId, dedupeKey],
  );
}

/**
 * Kada vlasnik isključi praćenje prisutnosti za uređaj, ono što o tom
 * uređaju već stoji mora nestati — i ono o stanju i ono o odlasku u
 * vrijeme rasporeda. "Ne javljaj mi za ovaj uređaj" ne znači "od
 * sljedećeg puta".
 */
export async function resolveOfflineNotices(
  client: PoolClient,
  accountId: string,
  networkDeviceId: string,
): Promise<void> {
  await client.query(
    `UPDATE notifications
     SET resolved_at = now()
     WHERE account_id = $1
       AND network_device_id = $2
       AND type = 'offline'
       AND resolved_at IS NULL`,
    [accountId, networkDeviceId],
  );
}

export async function getAccountTimeZone(
  client: PoolClient,
  accountId: string,
): Promise<string> {
  const { rows } = await client.query<{ timezone: string }>(
    'SELECT timezone FROM accounts WHERE id = $1',
    [accountId],
  );

  return rows[0]?.timezone ?? 'Europe/Sarajevo';
}

/**
 * Obavještenje o dostignutom kapacitetu.
 *
 * Prati stvarno stanje: pojavi se kad je limit dostignut, skloni se
 * kad broj uređaja padne ispod njega. Računa se pri čitanju liste i
 * pri javljanju hub-a — bez posla u pozadini koji bi mogao stati a da
 * to niko ne primijeti.
 */
export async function syncCapacityNotice(
  client: PoolClient,
  accountId: string,
): Promise<void> {
  const dedupeKey = 'capacity';

  const { rows } = await client.query<{ capacity: number | null; device_count: number }>(
    `SELECT
       d.capacity,
       (SELECT count(*)::int FROM network_devices nd WHERE nd.account_id = $1) AS device_count
     FROM devices d
     WHERE d.claimed_by_account_id = $1
     ORDER BY d.created_at ASC
     LIMIT 1`,
    [accountId],
  );

  const hub = rows[0];
  const capacity = hub?.capacity ?? 0;

  const limitReached = capacity > 0 && (hub?.device_count ?? 0) >= capacity;

  if (!limitReached) {
    await resolveNotification(client, accountId, dedupeKey);

    return;
  }

  await createNotification(client, accountId, {
    type: 'capacity',
    titleKey: 'notifications.capacityReached',
    messageKey: 'notifications.capacityMessage',
    params: { capacity },
    dedupeKey,
  });
}

/**
 * Nepoznat uređaj se pojavio na mreži.
 *
 * STANJE, ne događaj: stoji dok neko ne odluči šta je taj uređaj, i
 * sklanja se kad odluka padne. Zato `dedupeKey` nosi MAC adresu — hub
 * koji ponovo digne mrežu javi sve što vidi, i to ne smije napraviti
 * drugo obavještenje o istom uređaju.
 *
 * Ime uređaja ide u `params`, ne kao veza na red u bazi, iz istog
 * razloga kao kod odlaska sa mreže: uređaj obrisan iz liste ne smije
 * ostaviti obavještenje koje govori o „nepoznatom uređaju".
 */
export async function recordNewDeviceNotice(
  client: PoolClient,
  accountId: string,
  networkDeviceId: string,
  mac: string,
  name: string,
): Promise<void> {
  await createNotification(client, accountId, {
    type: 'new-device',
    titleKey: 'notifications.newDeviceTitle',
    messageKey: 'notifications.newDeviceMessage',
    params: { name, mac },
    dedupeKey: `new-device:${mac}`,
    networkDeviceId,
  });
}

/**
 * Sklanja obavještenja o uređajima o kojima je odluka u međuvremenu
 * pala.
 *
 * Namjerno se vezuje za STANJE uređaja, a ne za mjesto u kodu gdje je
 * odluka donesena. Odluka pada na četiri mjesta: pristanak, svrstavanje
 * među goste iz panela, isto to sa hub-a, i automatsko svrstavanje
 * poslije N sati (koje je grupni UPDATE, bez petlje po uređajima). Da
 * se poziv kalemi na svako od njih, peto mjesto koje neko doda sutra
 * ostavilo bi obavještenje da visi.
 *
 * Računa se pri čitanju, kao kapacitet i prisutnost — bez posla u
 * pozadini koji može stati a da to niko ne primijeti.
 */
export async function resolveClassifiedDeviceNotices(
  client: PoolClient,
  accountId: string,
): Promise<void> {
  await client.query(
    `UPDATE notifications n
     SET resolved_at = now()
     WHERE n.account_id = $1
       AND n.type = 'new-device'
       AND n.resolved_at IS NULL
       AND (
         n.network_device_id IS NULL
         OR EXISTS (
           SELECT 1 FROM network_devices nd
           WHERE nd.id = n.network_device_id
             AND nd.pairing_state <> 'unpaired'
         )
       )`,
    [accountId],
  );
}

/**
 * Provjera certifikata nije uspjela.
 *
 * Ovo je jedino obavještenje koje govori o nečemu što je korisnik
 * ZAPOČEO pa nije završio: pristanak je dat, instalacija nije prošla,
 * uređaj je ostao na osnovnoj zaštiti. Bez javljanja, čovjek ostaje u
 * uvjerenju da je puna zaštita uključena — a to je tačno ona vrsta
 * tihe rupe zbog koje se obećanje o zaštiti ne može održati.
 *
 * STANJE: sklanja se čim provjera prođe.
 */
export async function recordConsentFailure(
  client: PoolClient,
  accountId: string,
  networkDeviceId: string,
  name: string,
  reason: string | null,
): Promise<void> {
  await createNotification(client, accountId, {
    type: 'consent',
    titleKey: 'notifications.consentFailedTitle',
    messageKey: 'notifications.consentFailedMessage',
    params: { name, reason: reason ?? '' },
    dedupeKey: `consent-failed:${networkDeviceId}`,
    networkDeviceId,
  });
}

export async function resolveConsentFailure(
  client: PoolClient,
  accountId: string,
  networkDeviceId: string,
): Promise<void> {
  await resolveNotification(client, accountId, `consent-failed:${networkDeviceId}`);
}

/**
 * Uređaji čiji je pristanak dat na stariju verziju politike.
 *
 * Do sada se to vidjelo samo na ekranu pojedinačnog uređaja — pa je
 * vlasnik sa deset uređaja morao otvoriti svaki da sazna koji traži
 * ponovno prihvatanje. Poslije promjene politike to su svi uređaji sa
 * punom zaštitom odjednom, a upravo tada je zbirni pregled potreban.
 *
 * STANJE: nestaje kad posljednji uređaj obnovi pristanak.
 *
 * Za razliku od kapaciteta, ovdje se broj MIJENJA dok obavještenje
 * stoji — ljudi obnavljaju pristanak jedan po jedan. `createNotification`
 * preskače upis kad isto već postoji, pa bi broj ostao zamrznut na prvoj
 * vrijednosti: „3 uređaja" i kad je ostao jedan. Zato se postojeće
 * obavještenje osvježava na mjestu. Ne pravi se novo, jer bi svako
 * obnavljanje donijelo novo nepročitano obavještenje o istoj stvari.
 */
export async function syncReconsentNotice(
  client: PoolClient,
  accountId: string,
  currentPolicyVersion: string,
): Promise<void> {
  const dedupeKey = 'policy-reconsent';

  const { rows } = await client.query<{ name: string }>(
    `SELECT nd.name
     FROM consent_records cr
     JOIN network_devices nd ON nd.id = cr.network_device_id
     WHERE cr.account_id = $1
       AND cr.revoked_at IS NULL
       AND cr.policy_version <> $2
     ORDER BY nd.name`,
    [accountId, currentPolicyVersion],
  );

  if (rows.length === 0) {
    await resolveNotification(client, accountId, dedupeKey);

    return;
  }

  // Najviše pet imena. Tri tačke su iste na oba jezika, pa server ne
  // mora znati jezik korisnika da bi skratio listu.
  const shown = rows.slice(0, 5).map((row) => row.name);
  const names = rows.length > 5 ? `${shown.join(', ')}, …` : shown.join(', ');

  const params = { count: rows.length, names, version: currentPolicyVersion };

  const { rowCount } = await client.query(
    `UPDATE notifications
     SET params = $3::jsonb
     WHERE account_id = $1 AND dedupe_key = $2 AND resolved_at IS NULL`,
    [accountId, dedupeKey, JSON.stringify(params)],
  );

  if (rowCount) {
    return;
  }

  await createNotification(client, accountId, {
    type: 'consent',
    titleKey: 'notifications.reconsentTitle',
    messageKey: 'notifications.reconsentMessage',
    params,
    dedupeKey,
  });
}

/**
 * Podrazumijevano pratimo nestanak sa mreže samo za dječije i
 * tinejdžerske uređaje. Za TV ili roditeljski telefon to bi bila samo
 * buka, jer se gase svaki dan bez razloga za uzbunu. Isto pravilo kao
 * u panelu (DeviceService.offlineAlertEnabled).
 */
export function offlineAlertEnabled(device: PresenceDeviceRow): boolean {
  if (device.alert_when_offline !== null) {
    return device.alert_when_offline;
  }

  return device.profile === 'Child' || device.profile === 'Teen';
}

/**
 * Ključ "noći" u lokalnoj zoni.
 *
 * Raspored koji prelazi ponoć je jedna noć, a dva datuma. Da uređaj
 * koji se u 23:50 ugasi i u 00:10 ponovo nestane ne bi napravio dva
 * obavještenja o istoj noći, sve prije podne pripada prethodnom danu.
 */
function nightKey(at: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');

  // Datum se pomjera aritmetikom nad UTC ponoći tog lokalnog datuma,
  // da prelazak mjeseca ili godine ne treba računati ručno.
  const midnight = Date.UTC(value('year'), value('month') - 1, value('day'));

  const night = new Date(midnight - (value('hour') % 24 < 12 ? 86_400_000 : 0));

  return night.toISOString().slice(0, 10);
}

/**
 * Prijelaz prisutnosti jednog uređaja. Zove se sa svakog mjesta koje
 * `online` mijenja — iz panela (PATCH) i sa hub-a (prijava prisutnosti)
 * — da obavještenje ne bi zavisilo od toga ko je javio promjenu.
 */
export async function recordPresenceChange(
  client: PoolClient,
  accountId: string,
  timeZone: string,
  before: PresenceDeviceRow,
  after: PresenceDeviceRow,
  at: Date = new Date(),
): Promise<void> {
  if (before.online === after.online) {
    return;
  }

  const stateKey = `offline:${after.id}`;

  if (after.online) {
    // Uređaj se vratio: obavještenje o stanju se sklanja. Zapis o
    // odlasku u vrijeme rasporeda NAMJERNO ostaje — to je događaj.
    await resolveNotification(client, accountId, stateKey);

    return;
  }

  if (!offlineAlertEnabled(after)) {
    return;
  }

  const duringSchedule = isPausedAt(after.schedule, at, timeZone);

  if (duringSchedule) {
    await createNotification(client, accountId, {
      type: 'offline',
      titleKey: 'notifications.leftDuringSchedule',
      messageKey: 'notifications.leftDuringScheduleMessage',
      params: { device: after.name },
      dedupeKey: `offline-schedule:${after.id}:${nightKey(at, timeZone)}`,
      networkDeviceId: after.id,
    });

    return;
  }

  await createNotification(client, accountId, {
    type: 'offline',
    titleKey: 'notifications.deviceLeftNetwork',
    messageKey: 'notifications.deviceLeftNetworkMessage',
    params: { device: after.name },
    dedupeKey: stateKey,
    networkDeviceId: after.id,
  });
}
