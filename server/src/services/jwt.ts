import jwt from 'jsonwebtoken';

import { env } from '../env';

export interface AccountTokenPayload {
  sub: string;
  email: string;
}

export function signAccountToken(payload: AccountTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccountToken(token: string): AccountTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AccountTokenPayload;
}
