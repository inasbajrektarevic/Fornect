// Kod za potvrdu email adrese.
//
// Oblik je namjerno isti kao kod uparivanja hub-a (hub-pairing.ts):
// sest cifara, dovoljno kratko da se prepise iz maila bez greske.
// Razlika je u tome sto se ovaj kod nikad ne prikazuje nazad, pa se u
// bazi drzi samo njegov sha256 otisak.

import crypto from 'node:crypto';

/** Koliko kod vazi. Isto kao pairing kod — dovoljno da mail stigne. */
export const VERIFICATION_CODE_TTL_MINUTES = 15;

/**
 * Koliko pogresnih pokusaja kod izdrzi prije nego se ponisti.
 *
 * Sest cifara je milion kombinacija. Uz pet pokusaja po kodu, i uz
 * to da se ponistava nakon toga, gadjanje naslijepo prakticno nema
 * izgleda — a legitimnom korisniku koji pogrijesi pri prepisivanju
 * pet pokusaja je sasvim dovoljno.
 */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Najkrace vrijeme izmedju dva slanja. Sprjecava da se ruta za
 * ponovno slanje iskoristi za zasipanje tudje adrese mailovima.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

export function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Poredjenje otpornije na mjerenje vremena. Razlika je ovdje mala jer
 * poredimo hasheve, ali je besplatna pa nema razloga koristiti `===`.
 */
export function verificationCodeMatches(code: string, storedHash: string | null): boolean {
  if (!storedHash) {
    return false;
  }

  const given = Buffer.from(hashVerificationCode(code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  if (given.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(given, stored);
}
