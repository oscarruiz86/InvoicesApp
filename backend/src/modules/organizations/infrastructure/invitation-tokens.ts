import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface IssuedInvitationToken { readonly token: string; readonly tokenHash: string }

export function issueInvitationToken(): IssuedInvitationToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function issueInvitationCredential(now: Date, ttlHours: number): IssuedInvitationToken & { readonly expiresAt: Date } {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 720) throw new RangeError('INVITATION_TTL_INVALID');
  return { ...issueInvitationToken(), expiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function matchesInvitationToken(token: string, tokenHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
  const received = Buffer.from(hashInvitationToken(token), 'hex');
  const expected = Buffer.from(tokenHash, 'hex');
  return timingSafeEqual(received, expected);
}
