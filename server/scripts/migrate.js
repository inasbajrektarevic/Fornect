#!/usr/bin/env node

// Jednostavan migration runner bez ORM-a: čita .sql fajlove iz
// migrations/ po abecednom/brojčanom redu i primjenjuje samo one
// koji još nisu zabilježeni u schema_migrations.
//
// Namjerno je obična JS skripta (ne TypeScript) da bi se mogla
// pokrenuti direktno sa `node scripts/migrate.js` — i u dev okruženju
// i u produkcionom Docker image-u — bez potrebe za tsx/ts-node.

'use strict';

require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

// Kod kontejnerskog starta (Docker/Swarm) baza ponekad još nije
// mrežno vidljiva (DNS overlay mreže se tek smiruje) — bez retry-a
// prvi pokušaj puca sa ENOTFOUND/ECONNREFUSED i ruši cijeli kontejner
// prije nego server uopšte startuje. Par pokušaja sa kratkim
// razmakom je dovoljno i bezopasno (skripta je i inače idempotentna).
async function waitForDatabase(pool, attempts = 10, delayMs = 2000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (i === attempts) {
        throw error;
      }

      console.warn(
        `Baza još nije dostupna (pokušaj ${i}/${attempts}: ${error.message}), ponovni pokušaj za ${delayMs}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL nije postavljen.');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await waitForDatabase(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');

        console.log(`✔ primijenjena migracija: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migracija ${file} nije uspjela: ${error.message}`);
      } finally {
        client.release();
      }
    }

    console.log('Sve migracije su primijenjene.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
