// Tanak klijent za Headscale REST API v1 (gRPC-gateway/Huma, verzija
// 0.28.0 — putanje potvrđene iz proto definicija tog taga, ne
// pogađane). Sve pozive autentifikuje HEADSCALE_API_KEY (Bearer) —
// generisan JEDNOM preko `headscale apikeys create` direktno na
// Headscale kontejneru (Dokploy Terminal), ne po nalogu.
//
// VAŽNO — izolacija naloga NIJE ovdje. Ovaj klijent samo kreira
// Headscale "usere" i pre-auth ključeve; da tuđi telefon fizički ne
// može vidjeti tuđi hub, mora postojati globalna ACL politika
// (autogroup:self grant) postavljena JEDNOM na cijelom Headscale
// serveru — vidi docs/VPN_HEADSCALE_ARHITEKTURA.md. Bez te politike
// Headscale po defaultu dozvoljava sav saobraćaj između svih naloga.

import { env } from '../env';

export class HeadscaleNotConfiguredError extends Error {
  constructor() {
    super('Headscale integracija nije konfigurisana (HEADSCALE_URL / HEADSCALE_API_KEY).');
    this.name = 'HeadscaleNotConfiguredError';
  }
}

interface HeadscaleUser {
  id: string; // uint64 u proto-u, ali gRPC-gateway JSON mapping šalje kao string
  name: string;
}

interface HeadscalePreAuthKey {
  id: string;
  key: string;
  expiration: string;
}

async function headscaleFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.headscaleUrl || !env.headscaleApiKey) {
    throw new HeadscaleNotConfiguredError();
  }

  const response = await fetch(`${env.headscaleUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.headscaleApiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Headscale API greška (${response.status} ${path}): ${body}`);
  }

  return (await response.json()) as T;
}

// Headscale username mora biti jedinstven i DNS-bezbjedan. Prefiks +
// prvih 20 znakova UUID-a naloga (bez crtica) je dovoljno da izbjegne
// koliziju i ostane čitljivo u Headscale CLI/UI kad se nešto debuguje.
export function headscaleUsernameFor(accountId: string): string {
  return `fornect-${accountId.replace(/-/g, '').slice(0, 20)}`;
}

// Idempotentno: ako headscale user za ovaj nalog već postoji (traži
// se po imenu), vraća njega umjesto da puca na duplikatu.
export async function ensureHeadscaleUser(accountId: string): Promise<HeadscaleUser> {
  const name = headscaleUsernameFor(accountId);

  const existing = await headscaleFetch<{ users?: HeadscaleUser[] }>(
    `/api/v1/user?name=${encodeURIComponent(name)}`,
  );

  if (existing.users?.[0]) {
    return existing.users[0];
  }

  const created = await headscaleFetch<{ user: HeadscaleUser }>('/api/v1/user', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  return created.user;
}

export async function createPreAuthKey(
  headscaleUserId: string,
  opts: { ephemeral: boolean; expirationMinutes: number },
): Promise<HeadscalePreAuthKey> {
  const expiration = new Date(Date.now() + opts.expirationMinutes * 60_000).toISOString();

  const created = await headscaleFetch<{ preAuthKey: HeadscalePreAuthKey }>(
    '/api/v1/preauthkey',
    {
      method: 'POST',
      body: JSON.stringify({
        user: headscaleUserId,
        // Uvijek single-use (reusable: false) — svaki uređaj traži
        // svoj ključ preko /vpn/preauth-key, nema razloga dijeliti.
        reusable: false,
        ephemeral: opts.ephemeral,
        expiration,
      }),
    },
  );

  return created.preAuthKey;
}
