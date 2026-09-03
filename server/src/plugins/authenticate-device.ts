// Provjerava Bearer token iz Authorization headera i učitava uređaj
// kojem pripada. Koristi se kao preHandler na svim /api/v1/devices/:id/*
// rutama. Kada ruta ima :id parametar u putanji, provjerava i da se
// poklapa sa uređajem čiji je token poslan — jedan uređaj ne smije
// moći da čita/piše podatke drugog uređaja.

import type { FastifyReply, FastifyRequest } from 'fastify';

import { pool } from '../db';
import { hashDeviceToken } from '../services/device-tokens';
import type { DeviceRow } from '../types';

export async function authenticateDevice(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Nedostaje Bearer token.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const tokenHash = hashDeviceToken(token);

  const { rows } = await pool.query<DeviceRow>('SELECT * FROM devices WHERE token_hash = $1', [
    tokenHash,
  ]);

  const device = rows[0];

  if (!device) {
    return reply.code(401).send({ error: 'Nevažeći token.' });
  }

  const params = request.params as Record<string, string | undefined>;

  if (params['id'] && params['id'] !== device.id) {
    return reply.code(403).send({ error: 'Token ne pripada ovom uređaju.' });
  }

  request.device = device;
}
