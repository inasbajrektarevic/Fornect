// Pairing kod kojim account uparuje fizički hub bez admin ključa.
// 6 cifara (000000-999999, sa vodećim nulama) — dovoljno kratak da se
// unese ručno, dovoljno prostora (10^6) uz 15min TTL + unique
// index da brute-force nije praktičan (rate limit na claim rutu
// dodatno pokriva ovo).

import crypto from 'node:crypto';

export const PAIRING_CODE_TTL_MINUTES = 15;

export function generatePairingCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
