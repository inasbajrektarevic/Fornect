import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import './types';
import { authenticateAccount } from './plugins/authenticate-account';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { consentRoutes } from './routes/consent';
import { deviceEventRoutes } from './routes/device-events';
import { deviceRoutes } from './routes/devices';
import { fleetRoutes } from './routes/fleet';
import { healthRoutes } from './routes/health';
import { hubRoutes } from './routes/hub';
import { networkDeviceRoutes } from './routes/network-devices';
import { notificationRoutes } from './routes/notifications';
import { portalBundleRoutes, portalSettingsRoutes } from './routes/portal-settings';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // global: false — plugin se ne primjenjuje automatski na sve rute,
  // samo na one koje eksplicitno postave `config.rateLimit` (vidi
  // POST /api/v1/devices/register).
  app.register(rateLimit, { global: false });

  // Plain liveness ping (proces je živ) — bez provjere baze.
  app.get('/health', async () => ({ ok: true }));

  // Readiness za Dokploy health check — provjerava i konekciju na bazu.
  app.register(healthRoutes, { prefix: '/api/v1' });

  // Uređaji (Orange Pi agent) — Bearer token autentifikacija po ruti.
  app.register(deviceRoutes, { prefix: '/api/v1/devices' });

  // Eventi koje hub šalje ka cloud-u (Zadatak 1, Tačka 5). Isti
  // prefiks i ista device autentifikacija; odvojen fajl jer je to
  // zaseban kontrakt, ne još jedna operacija nad uređajem.
  app.register(deviceEventRoutes, { prefix: '/api/v1/devices' });

  // Hub povlači tekst i brend portala (stavka 1.2).
  app.register(portalBundleRoutes, { prefix: '/api/v1/devices' });

  // Interni admin panel — X-Admin-Key.
  app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // Registracija/login korisničkih naloga — bez auth-a (osim /me).
  app.register(authRoutes, { prefix: '/api/v1/auth' });

  // Sve /api/v1/app/* rute traže važeći JWT korisničkog naloga.
  // Hook je registrovan na enkapsulisanom pod-plugin-u, pa važi za
  // sve rute registrovane unutar njega, a ne curi na ostale prefikse.
  app.register(
    async (appScope) => {
      appScope.addHook('preHandler', authenticateAccount);

      appScope.register(networkDeviceRoutes, { prefix: '/network-devices' });
      appScope.register(notificationRoutes, { prefix: '/notifications' });
      appScope.register(portalSettingsRoutes);
      appScope.register(hubRoutes);

      // Fleet / OTA (Zadatak 1, Tačka 6). Bez prefiksa, kao i hub rute:
      // pune putanje su /fleet i /fleet/:id/...
      appScope.register(fleetRoutes);

      // Pristanak na presretanje. Bez prefiksa, jer sam definiše pune
      // putanje (/consent-records, /network-devices/:id/consent...) —
      // dio ruta visi ispod uređaja, a dio je na nivou naloga.
      appScope.register(consentRoutes);
    },
    { prefix: '/api/v1/app' },
  );

  return app;
}
