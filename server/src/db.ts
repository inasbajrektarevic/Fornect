// Dijeljeni pg Pool. Nema ORM-a — upiti su obični SQL, isto kao i
// migracije, da bi ostalo jednostavno za pratiti.

import { Pool } from 'pg';

import { env } from './env';

export const pool = new Pool({ connectionString: env.databaseUrl });
