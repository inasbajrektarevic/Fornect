#!/usr/bin/env node

// RAZVOJNA SKRIPTA — glumi hub koji javlja evente ka cloud-u.
//
// Kontrakt je iz Zadatka 1, Tačka 5. Ovo je jedini način da se red
// "Novi uređaji" napuni onako kako će se puniti na terenu — sa
// uređaja, a ne iz panela.
//
// Upotreba (koristi token iz .hub-ca/device.json):
//
//   node scripts/simulate-events.js new aa:bb:cc:dd:ee:ff "Kuhinjski tablet"
//   node scripts/simulate-events.js guest aa:bb:cc:dd:ee:ff
//   node scripts/simulate-events.js revoke aa:bb:cc:dd:ee:ff
//   node scripts/simulate-events.js verify-failed aa:bb:cc:dd:ee:ff
//
// Svaki poziv pravi novi event_id. Da se isproba ponavljanje (uređaj
// koji nije dobio odgovor pa šalje isto opet), doda se --id:
//
//   node scripts/simulate-events.js new aa:bb:cc:dd:ee:ff Tablet --id ev-1
//   node scripts/simulate-events.js new aa:bb:cc:dd:ee:ff Tablet --id ev-1
//
// Drugi poziv mora vratiti status "duplicate", ne "applied".

'use strict';

require('dotenv/config');

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEVICE_PATH = path.resolve(__dirname, '..', '.hub-ca', 'device.json');

const API = process.env.HUB_API_URL || 'http://localhost:3000';

function arg(name) {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

function buildEvent(kind, mac, name, eventId) {
  const base = { event_id: eventId, mac, at: new Date().toISOString() };

  switch (kind) {
    case 'new':
      return {
        ...base,
        type: 'device.new',
        name: name || mac,
        device_type: 'unknown',
      };

    case 'guest':
      return { ...base, type: 'device.classified', state: 'guest', method: 'portal' };

    case 'consented':
      return {
        ...base,
        type: 'device.classified',
        state: 'consented',
        method: 'portal',
        consent: {
          guardian_name: name || 'Roditelj sa portala',
          guardian_relation: 'parent',
          subject_is_minor: true,
        },
      };

    case 'revoke':
      return { ...base, type: 'consent.revoked', reason: 'Opozvano na uređaju.' };

    case 'verify-failed':
      return {
        ...base,
        type: 'consent.verify_failed',
        error: 'TLS handshake kroz Squid nije prošao.',
      };

    default:
      return null;
  }
}

async function main() {
  if (!fs.existsSync(DEVICE_PATH)) {
    console.error(
      'Nema .hub-ca/device.json — prvo pokreni: node scripts/simulate-hub-ca.js',
    );

    process.exitCode = 1;

    return;
  }

  const hub = JSON.parse(fs.readFileSync(DEVICE_PATH, 'utf8'));

  const [kind, mac, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (!kind || !mac) {
    console.error('Upotreba: simulate-events.js <new|guest|consented|revoke|verify-failed> <mac> [ime]');

    process.exitCode = 1;

    return;
  }

  const event = buildEvent(kind, mac.toLowerCase(), name, arg('--id') || crypto.randomUUID());

  if (!event) {
    console.error(`Nepoznat tip: ${kind}`);

    process.exitCode = 1;

    return;
  }

  const response = await fetch(`${API}/api/v1/devices/${hub.id}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hub.token}`,
    },
    body: JSON.stringify({ events: [event] }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Server je odbio paket (${response.status}):`, body);

    process.exitCode = 1;

    return;
  }

  const result = body.results?.[0] ?? {};

  console.log(
    `${event.type} za ${event.mac}: ${result.status}${result.reason ? ` — ${result.reason}` : ''}`,
  );
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
