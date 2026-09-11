#!/usr/bin/env node

// RAZVOJNA SKRIPTA — glumi Fornect hub koji se prvi put pokreće.
//
// Radi tačno ono što će Orange Pi agent raditi na terenu:
//   1. generiše vlastiti CA (par ključeva + self-signed certifikat),
//   2. privatni ključ ZADRŽAVA kod sebe, na disku,
//   3. registruje se na backend i dobije svoj Bearer token,
//   4. pošalje backendu SAMO javni certifikat i njegov otisak.
//
// Zato ovo nije lažni certifikat: certifikat je pravi X.509, ključ je
// pravi, otisak je stvarni SHA-256 otisak tog certifikata. Jedino što
// je simulirano jeste da ga generiše skripta umjesto hardvera — a to
// je upravo ono što Zadatak 2 kasnije zamijeni, bez ijedne izmjene u
// backendu ili panelu.
//
// Upotreba:
//   node scripts/simulate-hub-ca.js
//   node scripts/simulate-hub-ca.js --email ja@primjer.com
//
// `--email` je razvojna pogodnost: poveže uređaje tog naloga sa ovim
// hub-om, jer u stvarnosti to radi sam hub kad ih vidi na mreži.
//
// UPOZORENJE: ovaj CA je za razvoj. Ako ga instaliraš u sistem, svako
// ko dođe do fajla sa ključem (.hub-ca/ca.key.pem) može se lažno
// predstaviti kao bilo koja web stranica tvom računaru. Obriši ga iz
// sistemskih certifikata kad završiš testiranje.

'use strict';

require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const forge = require('node-forge');
const { Pool } = require('pg');

const OUT_DIR = path.resolve(__dirname, '..', '.hub-ca');
const KEY_PATH = path.join(OUT_DIR, 'ca.key.pem');
const CRT_PATH = path.join(OUT_DIR, 'ca.crt');
const DEVICE_PATH = path.join(OUT_DIR, 'device.json');

const API = process.env.HUB_API_URL || 'http://localhost:3000';

function arg(name) {
  const index = process.argv.indexOf(name);

  return index === -1 ? undefined : process.argv[index + 1];
}

/** Pravi self-signed CA certifikat i njegov SHA-256 otisak. */
function createCa(commonName) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));

  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'Fornect' },
    { shortName: 'OU', value: 'Development' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Otisak se računa nad DER oblikom certifikata — isto ono što
  // prikazuju Windows, Android i iOS pri instalaciji, pa ih korisnik
  // može uporediti znak po znak.
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();

  md.update(der);

  const fingerprint = md
    .digest()
    .toHex()
    .toUpperCase()
    .match(/.{2}/g)
    .join(':');

  return {
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    fingerprint,
  };
}

async function api(pathname, options) {
  const response = await fetch(API + pathname, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${options.method} ${pathname} -> ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function registerHub(name) {
  if (fs.existsSync(DEVICE_PATH)) {
    const saved = JSON.parse(fs.readFileSync(DEVICE_PATH, 'utf8'));

    console.log(`Koristim postojeći hub: ${saved.id}`);

    return saved;
  }

  const device = await api('/api/v1/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind: 'home', mode: 'home', capacity: 25 }),
  });

  // Token se od backenda može pročitati samo jednom, pri registraciji
  // — isto pravilo važi i za pravi uređaj, pa ga odmah snimamo.
  fs.writeFileSync(
    DEVICE_PATH,
    JSON.stringify({ id: device.id, token: device.token }, null, 2),
  );

  console.log(`Registrovan novi hub: ${device.id}`);

  return device;
}

/**
 * Razvojna pogodnost: poveže uređaje naloga sa ovim hub-om. U pogonu
 * to radi sam hub kad ih vidi na mreži, pa za to i ne postoji ruta —
 * zato ovdje idemo direktno u bazu, samo za razvoj.
 */
async function linkAccountDevices(email, hubId) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query(
      'SELECT id FROM accounts WHERE email = $1',
      [email],
    );

    if (rows.length === 0) {
      console.log(`Nalog ${email} ne postoji — preskačem povezivanje.`);

      return;
    }

    const { rowCount } = await pool.query(
      `UPDATE network_devices
       SET fornect_device_id = $2
       WHERE account_id = $1 AND fornect_device_id IS NULL`,
      [rows[0].id, hubId],
    );

    console.log(`Povezano uređaja sa hub-om: ${rowCount}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const email = arg('--email');
  const name = arg('--name') || 'Fornect Home (razvojni)';

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const hub = await registerHub(name);

  console.log('Generišem CA certifikat...');

  const ca = createCa(`Fornect Sentinel CA — ${name}`);

  fs.writeFileSync(KEY_PATH, ca.privateKeyPem, { mode: 0o600 });
  fs.writeFileSync(CRT_PATH, ca.certificatePem);

  await api(`/api/v1/devices/${hub.id}/ca`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hub.token}`,
    },
    body: JSON.stringify({
      certificate_pem: ca.certificatePem,
      fingerprint_sha256: ca.fingerprint,
    }),
  });

  if (email) {
    await linkAccountDevices(email, hub.id);
  }

  console.log('');
  console.log('Gotovo.');
  console.log(`  otisak:        ${ca.fingerprint}`);
  console.log(`  certifikat:    ${CRT_PATH}`);
  console.log(`  privatni ključ: ${KEY_PATH}  (ostaje ovdje, ne šalje se nigdje)`);
  console.log('');
  console.log('Otvori panel — otisak i preuzimanje certifikata sada rade.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
