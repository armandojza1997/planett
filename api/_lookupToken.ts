import crypto from 'crypto';

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

export function signLookupToken(id: number, secret: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${id}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyLookupToken(token: string, secret: string): number | null {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [idStr, expStr, providedSig] = parts;
  const id = Number(idStr);
  const exp = Number(expStr);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(exp) || Date.now() > exp) {
    return null;
  }
  const payload = `${id}.${exp}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length) return null;
  if (!crypto.timingSafeEqual(bufA, bufB)) return null;
  return id;
}
