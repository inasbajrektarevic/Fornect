import jwt from 'jsonwebtoken';

import { env } from '../env';

export interface AccountTokenPayload {
  sub: string;
  email: string;
}

/** Ono sto verify vrati: potpisani podaci + `iat` koji doda jsonwebtoken. */
export interface VerifiedAccountToken extends AccountTokenPayload {
  /** Kad je token izdat, u sekundama. */
  iat?: number;
}

export function signAccountToken(payload: AccountTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccountToken(token: string): VerifiedAccountToken {
  return jwt.verify(token, env.jwtSecret) as VerifiedAccountToken;
}
