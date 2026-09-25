import jwt from 'jsonwebtoken';

import { env } from '../env';

export interface AccountTokenPayload {
  sub: string;
  email: string;
  /**
   * Verzija lozinke u trenutku izdavanja (accounts.password_version).
   * Tokeni izdati prije migracije 021 je nemaju — vaze kao 0.
   */
  pwv?: number;
}

export function signAccountToken(payload: AccountTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccountToken(token: string): AccountTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccountTokenPayload;
}
