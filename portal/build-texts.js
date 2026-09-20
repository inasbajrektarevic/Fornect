#!/usr/bin/env node

// Izvlači tekstove koje portal DIJELI sa panelom iz jedinog izvora —
// src/app/core/services/language.ts — u portal/texts.json.
//
// Zašto ovo postoji:
//
// Portal i panel su dvije isporuke, ali korisniku govore istu stvar:
// koliko zaštita stvarno hvata i kako se instalira certifikat. Ako se
// ti tekstovi raziđu, jedna od dvije isporuke tvrdi nešto što druga ne
// tvrdi — a to je tačno ono na šta Zadatak 1, Oblast C upozorava
// (njemački UWG, dokazivost marketinške tvrdnje).
//
// Prepisati tekst rukom na dva mjesta znači čekati da se raziđu. Ovako
// se razilaženje vidi odmah:
//
//   node portal/build-texts.js          osvježi texts.json
//   node portal/build-texts.js --check  padne ako nije osvježen
//
// `--check` je ono što treba da stoji u CI-ju.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'app', 'core', 'services', 'language.ts');
const TARGET = path.join(__dirname, 'texts.json');

// Ključevi koje portal preuzima. Sve ostalo (naslovi, dugmad, forma)
// portal ima svoje, jer su to njegovi ekrani a ne panelovi.
const SHARED = [
  'protection.standardDescription',
  'protection.fullDescription',
  'protection.coverageNote',
  'protection.platformAndroid',
  'protection.platformIos',
  'protection.platformWindows',
  'protection.platformMac',
  'protection.androidNote',
  'protection.androidFirefoxNote',
  'protection.iosNote',
  'protection.windowsNote',
  'protection.macNote',
  'protection.pinningNote',
  // Koraci 1-4 su isti u panelu i na portalu. PETI NIJE i namjerno se
  // ne dijeli: u panelu on glasi "vratite se ovdje i potvrdite da je
  // profil instaliran", jer tamo postoji dugme i čovjek koji za tu
  // tvrdnju odgovara. Na portalu tog dugmeta nema — potvrda stiže sa
  // uređaja. Da se peti korak dijelio, portal bi upućivao na dugme koje
  // ne postoji.
  ...['android', 'ios', 'windows', 'mac'].flatMap((os) =>
    [1, 2, 3, 4].map((step) => `protection.${os}Step${step}`),
  ),
];

function parseBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;

  const block = source.slice(start, end === -1 ? source.length : end);

  const entries = {};
  const pattern = /'([a-zA-Z0-9_.]+)':\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;

  let match;

  while ((match = pattern.exec(block)) !== null) {
    entries[match[1]] = match[2].replace(/\\'/g, "'");
  }

  return entries;
}

function build() {
  const source = fs.readFileSync(SOURCE, 'utf8');

  const bs = parseBlock(source, '  bs: {', '  en: {');
  const en = parseBlock(source, '  en: {', null);

  const missing = SHARED.filter((key) => !bs[key] || !en[key]);

  if (missing.length > 0) {
    throw new Error(
      `U language.ts nedostaju ključevi koje portal dijeli sa panelom:\n  ${missing.join('\n  ')}`,
    );
  }

  const pick = (dict) => Object.fromEntries(SHARED.map((key) => [key, dict[key]]));

  return `${JSON.stringify({ bs: pick(bs), en: pick(en) }, null, 2)}\n`;
}

const built = build();

if (process.argv.includes('--check')) {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';

  if (current !== built) {
    console.error(
      'portal/texts.json se razišao sa language.ts.\n' +
        'Pokreni: node portal/build-texts.js\n\n' +
        'Ovo nije formalnost: portal i panel bi korisniku govorili različite\n' +
        'stvari o tome koliko zaštita hvata i kako se instalira certifikat.',
    );

    process.exitCode = 1;
  } else {
    console.log('portal/texts.json je usklađen sa language.ts.');
  }
} else {
  fs.writeFileSync(TARGET, built);

  console.log(`portal/texts.json osvježen (${SHARED.length} ključeva po jeziku).`);
}
