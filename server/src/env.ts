// Centralizovano čitanje i validacija environment varijabli.
// Padne odmah pri startu ako nešto obavezno nedostaje, umjesto da
// puca kasnije na prvi request.

import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Nedostaje obavezna environment varijabla: ${name}`);
  }

  return value;
}

export const env = {
  port: Number(process.env['PORT'] ?? 3000),
  host: process.env['HOST'] ?? '0.0.0.0',

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '30d',

  adminApiKey: required('ADMIN_API_KEY'),

  deviceOnlineThresholdMinutes: Number(process.env['DEVICE_ONLINE_THRESHOLD_MINUTES'] ?? 15),
};
