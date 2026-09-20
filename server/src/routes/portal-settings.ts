// Tekst i brend captive portala.
//
// Dvije strane istog podatka:
//
//   GET/PUT /api/v1/app/portal-settings   panel uređuje (JWT naloga)
//   GET /api/v1/devices/:id/portal-bundle hub povlači (Bearer uređaja)
//
// Druga ruta je Lukmanov `GET /v1/portal/bundle`. U njegovoj tabeli ona
// stoji među rutama LOKALNOG API-ja na uređaju, a opisana je kao
// "cloud → uređaj" — to je nedorečeno i treba ga pitati. Ovdje je
// napravljena kao cloud ruta, jer podatak živi ovdje.
//
// Šta se OVDJE ne podešava: brojke o dometu zaštite i uputstvo za
// certifikat. To su tvrdnje za koje Fornect odgovara pred zakonom, a ne
// tekst koji vlasnik mreže mijenja po volji.

import type { FastifyInstance } from 'fastify';

import { pool } from '../db';
import { authenticateDevice } from '../plugins/authenticate-device';

interface PortalSettingsRow {
  account_id: string;
  brand_name: string;
  accent_color: string;
  welcome_title_bs: string;
  welcome_title_en: string;
  welcome_message_bs: string;
  welcome_message_en: string;
  support_contact: string;
  privacy_policy_url: string;
  version: number;
  updated_at: string;
}

interface SaveBody {
  brand_name?: string;
  accent_color?: string;
  welcome_title_bs?: string;
  welcome_title_en?: string;
  welcome_message_bs?: string;
  welcome_message_en?: string;
  support_contact?: string;
  privacy_policy_url?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Gornje granice postoje zato što ovaj tekst završi na ekranu telefona
// iza captive portala. Naslov od dvije hiljade znakova ne bi bio
// podešavanje nego način da se portal učini neupotrebljivim.
const LIMITS = {
  brand_name: 40,
  welcome_title_bs: 80,
  welcome_title_en: 80,
  welcome_message_bs: 300,
  welcome_message_en: 300,
  support_contact: 120,
  privacy_policy_url: 300,
} as const;

const TEXT_FIELDS = Object.keys(LIMITS) as (keyof typeof LIMITS)[];

/** Red za nalog, ili podrazumijevani ako ga još nema. */
async function loadOrDefault(accountId: string): Promise<PortalSettingsRow> {
  const { rows } = await pool.query<PortalSettingsRow>(
    'SELECT * FROM portal_settings WHERE account_id = $1',
    [accountId],
  );

  if (rows[0]) {
    return rows[0];
  }

  // Red se ne pravi pri čitanju — nalog koji ništa nije mijenjao ne
  // treba da ima zapis. Podrazumijevane vrijednosti su iste kao u
  // migraciji; drže se na jednom mjestu tako što ih baza sama napiše
  // pri prvom snimanju.
  const { rows: defaults } = await pool.query<PortalSettingsRow>(
    `SELECT
       $1::uuid AS account_id,
       'Fornect' AS brand_name,
       '#f5821f' AS accent_color,
       'Dobrodošli na zaštićenu mrežu' AS welcome_title_bs,
       'Welcome to a protected network' AS welcome_title_en,
       'Ova mreža filtrira reklame i praćenje. Izaberite kako želite da se vaš uređaj štiti.'
         AS welcome_message_bs,
       'This network filters ads and tracking. Choose how you want your device protected.'
         AS welcome_message_en,
       '' AS support_contact,
       '' AS privacy_policy_url,
       0 AS version,
       now() AS updated_at`,
    [accountId],
  );

  return defaults[0]!;
}

function validate(body: SaveBody): string | null {
  for (const field of TEXT_FIELDS) {
    const value = body[field];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== 'string') {
      return `${field} mora biti tekst.`;
    }

    if (value.trim().length > LIMITS[field]) {
      return `${field} može imati najviše ${LIMITS[field]} znakova.`;
    }
  }

  // Prazan naslov bi ostavio portal bez ijedne rečenice objašnjenja, a
  // gost bi vidio samo dva dugmeta i ne bi znao o čemu odlučuje.
  for (const field of ['brand_name', 'welcome_title_bs', 'welcome_title_en'] as const) {
    if (body[field] !== undefined && !body[field]!.trim()) {
      return `${field} ne smije biti prazan.`;
    }
  }

  if (body.accent_color !== undefined && !HEX_COLOR.test(body.accent_color)) {
    return 'accent_color mora biti hex boja, npr. #f5821f.';
  }

  // Ovo završi kao href na portalu. Proizvoljan string bi tamo bio
  // proizvoljna veza — uključujući javascript: i slično.
  const url = body.privacy_policy_url?.trim();

  if (url && !/^https?:\/\//i.test(url)) {
    return 'privacy_policy_url mora počinjati sa http:// ili https://.';
  }

  return null;
}

export async function portalSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/portal-settings', async (request, reply) =>
    reply.send(await loadOrDefault(request.accountId!)),
  );

  fastify.put<{ Body: SaveBody }>('/portal-settings', async (request, reply) => {
    const body = request.body ?? {};

    const problem = validate(body);

    if (problem) {
      return reply.code(400).send({ error: problem });
    }

    const current = await loadOrDefault(request.accountId!);

    const merged = {
      brand_name: (body.brand_name ?? current.brand_name).trim(),
      accent_color: body.accent_color ?? current.accent_color,
      welcome_title_bs: (body.welcome_title_bs ?? current.welcome_title_bs).trim(),
      welcome_title_en: (body.welcome_title_en ?? current.welcome_title_en).trim(),
      welcome_message_bs: (body.welcome_message_bs ?? current.welcome_message_bs).trim(),
      welcome_message_en: (body.welcome_message_en ?? current.welcome_message_en).trim(),
      support_contact: (body.support_contact ?? current.support_contact).trim(),
      privacy_policy_url: (body.privacy_policy_url ?? current.privacy_policy_url).trim(),
    };

    const { rows } = await pool.query<PortalSettingsRow>(
      `INSERT INTO portal_settings (
         account_id, brand_name, accent_color,
         welcome_title_bs, welcome_title_en,
         welcome_message_bs, welcome_message_en,
         support_contact, privacy_policy_url, version, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, now())
       ON CONFLICT (account_id) DO UPDATE SET
         brand_name = EXCLUDED.brand_name,
         accent_color = EXCLUDED.accent_color,
         welcome_title_bs = EXCLUDED.welcome_title_bs,
         welcome_title_en = EXCLUDED.welcome_title_en,
         welcome_message_bs = EXCLUDED.welcome_message_bs,
         welcome_message_en = EXCLUDED.welcome_message_en,
         support_contact = EXCLUDED.support_contact,
         privacy_policy_url = EXCLUDED.privacy_policy_url,
         -- Verzija raste i kad se snimi ista vrijednost: uređaj tako
         -- vidi da je neko dirao postavke, a ne mora porediti tekst.
         version = portal_settings.version + 1,
         updated_at = now()
       RETURNING *`,
      [
        request.accountId,
        merged.brand_name,
        merged.accent_color,
        merged.welcome_title_bs,
        merged.welcome_title_en,
        merged.welcome_message_bs,
        merged.welcome_message_en,
        merged.support_contact,
        merged.privacy_policy_url,
      ],
    );

    return reply.send(rows[0]);
  });
}

export async function portalBundleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/:id/portal-bundle',
    { preHandler: authenticateDevice },
    async (request, reply) => {
      const hub = request.device!;

      if (!hub.claimed_by_account_id) {
        return reply
          .code(409)
          .send({ error: 'Uređaj još nije uparen ni sa jednim nalogom.' });
      }

      const settings = await loadOrDefault(hub.claimed_by_account_id);

      // Hub šalje verziju koju već ima. Ako je ista, nema šta da se
      // prenosi — 304 umjesto istog paketa svakih pet minuta.
      const known = Number(request.query?.version);

      if (Number.isFinite(known) && known === settings.version) {
        return reply.code(304).send();
      }

      // Oblik je isti kao portal/config.json, da uređaj taj fajl samo
      // prepiše i portal nastavi čitati bez ijedne izmjene u kodu.
      return reply.send({
        version: settings.version,
        updated_at: settings.updated_at,
        config: {
          brandName: settings.brand_name,
          accentColor: settings.accent_color,
          welcomeTitle: {
            bs: settings.welcome_title_bs,
            en: settings.welcome_title_en,
          },
          welcomeMessage: {
            bs: settings.welcome_message_bs,
            en: settings.welcome_message_en,
          },
          supportContact: settings.support_contact,
          privacyPolicyUrl: settings.privacy_policy_url,
        },
      });
    },
  );
}
