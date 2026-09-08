import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import './types';
import { authenticateAccount } from './plugins/authenticate-account';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { deviceRoutes } from './routes/devices';
import { healthRoutes } from './routes/health';
import { hubRoutes } from './routes/hub';
import { networkDeviceRoutes } from './routes/network-devices';

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
      appScope.register(hubRoutes);
    },
    { prefix: '/api/v1/app' },
  );

  return app;
}
