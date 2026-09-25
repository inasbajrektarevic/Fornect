// Zajednički tipovi + proširenje Fastify request-a sa poljima koja
// upisuju naši auth pluginovi (authenticateDevice / authenticateAccount).

export interface DeviceRow {
  id: string;
  name: string;
  token_hash: string;
  status: 'online' | 'offline';
  last_seen_at: string | null;
  kind: 'home' | 'pro';
  mode: 'home' | 'hospitality' | 'agency';
  capacity: number | null;
  claimed_by_account_id: string | null;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  /** Javni CA certifikat hub-a. Privatni ključ nikad ne dolazi ovdje. */
  ca_certificate_pem: string | null;
  ca_fingerprint_sha256: string | null;
  ca_registered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  /** sha256 otisak koda za potvrdu; sam kod se nigdje ne cuva. */
  verification_code_hash: string | null;
  verification_code_expires_at: string | null;
  verification_attempts: number;
  verification_sent_at: string | null;
  /** sha256 otisak koda za novu lozinku (migracija 021). */
  password_reset_code_hash: string | null;
  password_reset_expires_at: string | null;
  password_reset_attempts: number;
  password_reset_sent_at: string | null;
  password_reset_window_started_at: string | null;
  password_reset_requests: number;
  /** Raste sa svakom promjenom lozinke; token sa starijom ne vrijedi. */
  password_version: number;
  /** Samo zapis — kad je lozinka zadnji put mijenjana. */
  password_changed_at: string | null;
  /** IANA zona naloga; server po njoj računa da li raspored traje. */
  timezone: string;
  created_at: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    // Postavlja authenticateDevice preHandler nakon provjere Bearer tokena.
    device?: DeviceRow;
    // Postavlja authenticateAccount preHandler nakon provjere JWT-a.
    accountId?: string;
  }
}
