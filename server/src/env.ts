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

  // Nakon koliko sati se neklasifikovan uređaj sam svrstava među
  // goste (Zadatak 1, Tačka 5). Nula isključuje politiku.
  autoGuestAfterHours: Number(process.env['AUTO_GUEST_AFTER_HOURS'] ?? 24),

  // 'log' upisuje mail u .mail-outbox/ i u log; 'smtp' šalje stvarno.
  // Podrazumijevano je 'log' da razvoj i testovi rade bez SMTP-a, i da
  // se pravi mail nikad ne pošalje slučajno, nego tek kad se svjesno
  // uključi.
  mailTransport: process.env['MAIL_TRANSPORT'] === 'smtp' ? 'smtp' : 'log',
  mailFrom: process.env['MAIL_FROM'] ?? 'Fornect <no-reply@fornect.local>',

  smtpHost: process.env['SMTP_HOST'] ?? '',
  smtpPort: Number(process.env['SMTP_PORT'] ?? 587),
  smtpUser: process.env['SMTP_USER'] ?? '',
  smtpPassword: process.env['SMTP_PASSWORD'] ?? '',

  // Da li prijava traži potvrđenu email adresu.
  //
  // Podrazumijevano ISKLJUČENO, svjesno: da je uključeno, uključivanje
  // ove izmjene bi odmah zaključalo sve postojeće naloge na produkciji,
  // gdje SMTP još nije podešen — niko se ne bi mogao prijaviti ni
  // dobiti kod. Uključiti tek kad slanje mailova radi.
  requireVerifiedEmail: process.env['REQUIRE_VERIFIED_EMAIL'] === 'true',
};
