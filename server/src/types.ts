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
  created_at: string;
  updated_at: string;
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
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
