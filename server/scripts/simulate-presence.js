#!/usr/bin/env node

// RAZVOJNA SKRIPTA — glumi hub koji javlja koga vidi na mreži.
//
// Radi tačno ono što će Orange Pi agent raditi na terenu: pošalje
// spisak MAC adresa koje trenutno vidi. Server sam zaključuje ko je
// nestao i, ako je nestao u vrijeme rasporeda, upiše obavještenje.
//
// Ovo je jedini put kojim obavještenje o odlasku sa mreže nastaje bez
// otvorene aplikacije. Dok Zadatak 2 ne isporuči agenta, ova skripta
// je način da se ta putanja isproba od kraja do kraja.
//
// Upotreba (koristi token iz .hub-ca/device.json, koji je napravio
// simulate-hub-ca.js):
//
//   node scripts/simulate-presence.js aa:bb:cc:dd:ee:ff
//   node scripts/simulate-presence.js --none
//
// Adrese koje NISU navedene server vidi kao nestale sa mreže.

'use strict';

require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');

const DEVICE_PATH = path.resolve(__dirname, '..', '.hub-ca', 'device.json');

const API = process.env.HUB_API_URL || 'http://localhost:3000';

async function main() {
  if (!fs.existsSync(DEVICE_PATH)) {
    console.error(
      'Nema .hub-ca/device.json — prvo pokreni: node scripts/simulate-hub-ca.js',
    );

    process.exitCode = 1;

    return;
  }

  const hub = JSON.parse(fs.readFileSync(DEVICE_PATH, 'utf8'));

  const args = process.argv.slice(2);

  const macs = args.includes('--none') ? [] : args.filter((arg) => !arg.startsWith('--'));

  const response = await fetch(`${API}/api/v1/devices/${hub.id}/network-presence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hub.token}`,
    },
    body: JSON.stringify({ macs }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Server je odbio prijavu (${response.status}):`, body);

    process.exitCode = 1;

    return;
  }

  console.log(
    `Prijavljeno ${macs.length} prisutnih. Uređaja na hub-u: ${body.devices}, promjena stanja: ${body.changed}.`,
  );
}

main().catch((error) => {
  console.error(error);

  process.exitCode = 1;
});
