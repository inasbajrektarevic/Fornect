// POST /api/v1/app/vpn/preauth-key — izdaje kratkotrajni Headscale
// pre-auth ključ za uparivanje HUB-a ili TELEFONA na tailnet ovog
// naloga (VPN roaming zaštita — korisnik zadržava DNS+MITM zaštitu i
// van kućne mreže preko hub-a kao exit-node/subnet router-a).
//
// Izolacija između naloga NIJE ovdje — postiže se globalnom Headscale
// ACL politikom (autogroup:self), postavljenom jednom za cijeli
// server. Vidi docs/VPN_HEADSCALE_ARHITEKTURA.md.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { env } from '../env';
import {
  createPreAuthKey,
  ensureHeadscaleUser,
  HeadscaleNotConfiguredError,
} from '../services/headscale';

interface PreAuthKeyBody {
  purpose?: 'hub' | 'phone';
}

export async function vpnRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: PreAuthKeyBody }>(
    '/vpn/preauth-key',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const purpose = request.body?.purpose;

      if (purpose !== 'hub' && purpose !== 'phone') {
        return reply.code(400).send({ error: "purpose mora biti 'hub' ili 'phone'." });
      }

      try {
        const headscaleUser = await ensureHeadscaleUser(request.accountId as string);

        await pool.query(
          `INSERT INTO vpn_accounts (account_id, headscale_user_id, headscale_user_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (account_id) DO NOTHING`,
          [request.accountId, headscaleUser.id, headscaleUser.name],
        );

        // Hub: duži prozor (fizička instalacija/prvo povezivanje
        // traje). Telefon: kraći. Nijedan nije ephemeral — čvor mora
        // preživjeti privremeni gubitak konekcije, ne smije se
        // obrisati iz tailnet-a čim se ugasi VPN na telefonu.
        const expirationMinutes = purpose === 'hub' ? 30 : 15;

        const key = await createPreAuthKey(headscaleUser.id, {
          ephemeral: false,
          expirationMinutes,
        });

        await pool.query(
          `INSERT INTO vpn_preauth_key_events (account_id, purpose, headscale_key_id, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [request.accountId, purpose, key.id, key.expiration],
        );

        return reply.code(200).send({
          key: key.key,
          login_server: env.headscaleUrl,
          expires_at: key.expiration,
        });
      } catch (error) {
        if (error instanceof HeadscaleNotConfiguredError) {
          return reply.code(503).send({ error: error.message });
        }

        request.log.error(error, 'Headscale preauth-key greška');
        return reply
          .code(502)
          .send({ error: 'VPN servis trenutno nedostupan, pokušajte kasnije.' });
      }
    },
  );
}
