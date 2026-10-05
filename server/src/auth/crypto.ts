import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordCredential } from './types';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<PasswordCredential> {
  const passwordSalt = randomBytes(16).toString('hex');
  const passwordDigest = (await derivePassword(password, passwordSalt)).toString('hex');
  return { passwordSalt, passwordDigest };
}

export async function verifyPassword(password: string, credential: PasswordCredential): Promise<boolean> {
  if (!/^[a-f0-9]{128}$/i.test(credential.passwordDigest)) return false;
  const derived = await derivePassword(password, credential.passwordSalt);
  return timingSafeEqual(derived, Buffer.from(credential.passwordDigest, 'hex'));
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function sessionExpiresAt(now = Date.now()): number { return now + SESSION_TTL_MS; }

export function isSessionExpired(expiresAt: number, now = Date.now()): boolean { return expiresAt <= now; }
