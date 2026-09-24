#!/usr/bin/env node

// RAZVOJNI SERVER — glumi fornectd koji servira captive portal.
//
// Na terenu portal servira sam Fornect uređaj: on zna MAC klijenta iz
// DHCP/ARP tabele, on drži CA, i samo on može reći da li je TLS
// handshake kroz Squid prošao. Ništa od toga ne postoji dok hardver iz
// Zadatka 2 ne proradi, pa bi portal do tada bio nešto što se ne može
// ni otvoriti.
//
// Ovaj server postoji da se to ne desi: implementira isti lokalni API
// (kontrakt iz Zadatka 1, Tačka 5) u memoriji, pa se portal može
// otvoriti, proći i testirati već sada.
//
//   node portal/dev-server.js          → http://localhost:4300
//
// ŠTO JE OVDJE LAŽNO, a na uređaju nije:
//   - MAC klijenta je izmišljen (uređaj ga zna iz ARP tabele).
//   - Provjera certifikata: na uređaju je `check_url` HTTPS adresa koja
//     ide kroz Squid, pa učitavanje slike sa nje dokazuje da pregledač
//     vjeruje CA. Ovdje je to obična HTTP adresa koja počne vraćati
//     sliku nakon par sekundi — oblik je isti, dokaz nije.
//   - CA se servira iz server/.hub-ca/ca.crt ako postoji (napravi ga
//     simulate-hub-ca.js), inače je to očigledan placeholder.
//
// Scenariji za testove — POST /dev/scenario {"name": "..."}:
//   default    normalan tok (uređaj se prvi put javlja)
//   capacity   licenca je popunjena
//   never      provjera certifikata nikad ne prođe
//   guest      uređaj se vraća, već ima osnovnu zaštitu
//   consented  uređaj se vraća, već ima punu zaštitu
//   verifying  pristanak je dat, certifikat još nije dokazan
//   oldpolicy  uređaj je pristao na stariju verziju politike

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORTAL_PORT || 4300);
const ROOT = __dirname;
const CA_PATH = path.resolve(ROOT, '..', 'server', '.hub-ca', 'ca.crt');

// Koliko se čeka da "handshake prođe". Na uređaju to nije čekanje nego
// stvarna provjera; ovdje je samo da se vidi kako ekran izgleda.
const VERIFY_AFTER_MS = Number(process.env.PORTAL_VERIFY_AFTER_MS || 2500);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.crt': 'application/x-pem-file',
};

let scenario = 'default';

let device = {
  mac: '02:00:00:00:ab:cd',
  device_name: 'Testni telefon',
  // Rječnik iz kontrakta: unknown → (guest | verifying → consented).
  state: 'unknown',
  accepted_policy_version: null,
  consented_at: 0,
};

function reset() {
  device = {
    mac: '02:00:00:00:ab:cd',
    device_name: 'Testni telefon',
    state: 'unknown',
    accepted_policy_version: null,
    consented_at: 0,
  };
}

function json(res, code, body) {
  const payload = JSON.stringify(body);

  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // Portal se ne smije keširati: uređaj koji se ponovo spoji mora
    // dobiti svježe stanje, ne ono od prošlog puta.
    'Cache-Control': 'no-store',
  });

  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function serveStatic(res, urlPath) {
  const name = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(ROOT, path.normalize(name).replace(/^(\.\.[/\\])+/, ''));

  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');

    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });

  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === '/dev/scenario' && req.method === 'POST') {
    const body = await readBody(req);

    scenario = body.name || 'default';
    reset();

    // Scenariji koji glume uređaj koji se VRAĆA na mrežu. Bez njih se
    // ne može isprobati ono zbog čega portal uopšte čita stanje.
    if (scenario === 'guest' || scenario === 'consented' || scenario === 'verifying') {
      device.state = scenario;
      device.accepted_policy_version = '1.0';

      // Uređaj usred instalacije: provjera treba da potraje isto
      // koliko i inače, inače bi scenarij preskočio ekran uputstva.
      if (scenario === 'verifying') {
        device.consented_at = Date.now();
      }
    }

    if (scenario === 'oldpolicy') {
      device.state = 'consented';
      device.accepted_policy_version = '0.9';
    }

    return json(res, 200, { ok: true, scenario });
  }

  if (route === '/v1/portal/session') {
    return json(res, 200, {
      mac: device.mac,
      device_name: device.device_name,
      state: device.state,
      policy_version: '1.0',
      // Koju je verziju uređaj prihvatio. Starija → portal traži da
      // korisnik ponovo odluči.
      accepted_policy_version: device.accepted_policy_version,
      ca_fingerprint: readFingerprint(),
      ca_url: '/v1/portal/ca.crt',
      capacity_full: scenario === 'capacity',
      // Na uređaju: https adresa iza Squid MITM-a. Ako se slika učita,
      // pregledač je prihvatio certifikat koji je Squid potpisao.
      // Na uređaju: https adresa koju Squid bump-uje, vraća 204.
      check_url: '/v1/portal/check',
      // Na uređaju je ovo koliko njegov Squid treba; ovdje je kratko u
      // scenariju 'never', da se ekran neuspjeha vidi bez čekanja.
      check_timeout_ms: scenario === 'never' ? 5000 : 90000,
      language: 'bs',
    });
  }

  if (route === '/v1/portal/check') {
    // Na uređaju ovo prolazi kroz Squid: ako pregledač vjeruje CA,
    // handshake uspije i vrati se 204. Uređaj TO vidi i sam promoviše
    // MAC — portal ne odlučuje ništa.
    const handshakeOk =
      device.state === 'verifying' &&
      scenario !== 'never' &&
      Date.now() - device.consented_at >= VERIFY_AFTER_MS;

    if (!handshakeOk) {
      res.writeHead(502, { 'Cache-Control': 'no-store' });

      return res.end();
    }

    device.state = 'consented';
    device.accepted_policy_version = '1.0';

    res.writeHead(204, { 'Cache-Control': 'no-store' });

    return res.end();
  }

  const revoke = /^\/v1\/consent\/([^/]+)\/revoke$/.exec(route);

  if (revoke && req.method === 'POST') {
    device.state = 'guest';
    device.accepted_policy_version = null;

    return json(res, 200, { ok: true, state: device.state });
  }

  if (route === '/v1/portal/ca.crt') {
    if (fs.existsSync(CA_PATH)) {
      res.writeHead(200, { 'Content-Type': MIME['.crt'] });

      return res.end(fs.readFileSync(CA_PATH));
    }

    res.writeHead(200, { 'Content-Type': MIME['.crt'] });

    return res.end(
      '# Ovdje na uređaju stoji pravi CA certifikat.\n' +
        '# Napravi ga: node server/scripts/simulate-hub-ca.js\n',
    );
  }

  const classify = /^\/v1\/devices\/([^/]+)\/classify$/.exec(route);

  if (classify && req.method === 'POST') {
    const body = await readBody(req);

    if (body.state === 'consented') {
      const consent = body.consent || {};

      // Pristanak je uslov da se UĐE u tok, ne da se potvrdi
      // instalacija: uređaj koji je već u `verifying` ga je dao ranije.
      const alreadyConsented =
        device.state === 'verifying' || device.state === 'consented';

      // Ista provjera kao na serveru: prazan potpis se ne prima.
      if (!alreadyConsented && (!consent.guardian_name || !consent.guardian_relation)) {
        return json(res, 400, {
          error: 'guardian_name i guardian_relation su obavezni.',
        });
      }

      // Pristanak je dat, ali jos nije dokazan — MAC ide u `verifying`
      // dok TLS handshake ne prodje (Tacka 5). `manual` je fallback i
      // preskace dokaz, pa se u zapisu vodi kao izjavljen.
      device.state = body.method === 'manual' ? 'consented' : 'verifying';
      device.accepted_policy_version = '1.0';
      device.consented_at = Date.now();

      return json(res, 200, { ok: true, state: device.state });
    }

    if (body.state === 'guest') {
      device.state = 'guest';

      return json(res, 200, { ok: true, state: device.state });
    }

    return json(res, 400, { error: 'state mora biti guest ili consented.' });
  }

  return serveStatic(res, route);
});

function readFingerprint() {
  // Otisak se na uređaju računa iz samog certifikata. Ovdje se čita iz
  // onoga što je simulate-hub-ca.js napisao, ako postoji.
  const meta = path.resolve(ROOT, '..', 'server', '.hub-ca', 'device.json');

  if (fs.existsSync(meta)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(meta, 'utf8'));

      if (parsed.fingerprint) {
        return parsed.fingerprint;
      }
    } catch {
      // Pada dalje na placeholder.
    }
  }

  return 'RAZVOJ:NEMA:PRAVOG:OTISKA:POKRENI:SIMULATE-HUB-CA';
}

server.listen(PORT, () => {
  console.log(`Portal (razvojni fornectd) na http://localhost:${PORT}`);
});
