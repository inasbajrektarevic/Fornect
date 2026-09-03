import cors from '@fastify/cors';
import Fastify from 'fastify';

import './types';
import { authenticateAccount } from './plugins/authenticate-account';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { deviceRoutes } from './routes/devices';
import { hubRoutes } from './routes/hub';
import { networkDeviceRoutes } from './routes/network-devices';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

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
