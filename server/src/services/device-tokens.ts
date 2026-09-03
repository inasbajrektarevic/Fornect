// Uređaji se autentifikuju Bearer tokenom. Sam token se generiše
// jednom (pri registraciji) i vraća uređaju — u bazi čuvamo samo
// njegov sha256 otisak, isto kao što se lozinke nikad ne čuvaju u
// plain-textu.

import crypto from 'node:crypto';

export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
