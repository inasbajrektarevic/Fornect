// Kod za reset zaboravljene lozinke.
//
// Generisanje, otisak i poredjenje koda su isti kao za potvrdu email
// adrese (email-verification.ts) — sest cifara, sha256, timingSafeEqual.
// Ovdje stoje samo granice, jer je reset lozinke osjetljiviji: uspjesno
// pogodjen kod znaci preuzet nalog, ne samo potvrdjenu adresu.

export {
  generateVerificationCode as generatePasswordResetCode,
  hashVerificationCode as hashPasswordResetCode,
  verificationCodeMatches as passwordResetCodeMatches,
} from './email-verification';

/** Koliko kod vazi. */
export const PASSWORD_RESET_TTL_MINUTES = 15;

/** Pogresnih pokusaja po jednom kodu, pa se kod vise ne prima. */
export const MAX_PASSWORD_RESET_ATTEMPTS = 5;

/** Najkrace vrijeme izmedju dva slanja na isti nalog. */
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

/**
 * Najvise kodova po nalogu u 24 sata.
 *
 * Bez ovoga napadac trazi novi kod svake minute i dobija pet novih
 * pokusaja: oko 7.000 pogadjanja dnevno. Sa pet kodova dnevno ostaje 25.
 * Cijena: napadac moze potrositi tih pet i tako vlasniku odgoditi reset
 * do sutra — ali lozinka ostaje ista i prijava i dalje radi.
 */
export const MAX_PASSWORD_RESETS_PER_DAY = 5;

export const MIN_PASSWORD_LENGTH = 8;
