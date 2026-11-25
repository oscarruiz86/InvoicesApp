import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyOfflineCredential } from '@/modules/invoices/infrastructure/offline-credential';
import type { OfflineCredentialRecord } from '@/modules/invoices/infrastructure/offline-invoice-queue';

const subject = 'driver-1', thirdPartyId = 'b'.repeat(24), assignmentId = 'a'.repeat(24), vehicleId = 'c'.repeat(24);
const now = Date.parse('2026-11-23T12:00:00Z');
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateKey = createPrivateKey(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
const publicJwk = { ...(pair.publicKey.export({ format: 'jwk' })), kid: 'offline-v1' } as JsonWebKey & { kid: string };

function token(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'ES256', typ: 'JWT', kid: 'offline-v1' });
  const payload = encode({ iss: 'invoice-app', aud: 'invoice-offline-capture', sub: subject, thirdPartyId,
    assignmentIds: [assignmentId], scope: 'invoice:offline-capture', iat: Math.floor(now / 1000) - 10, exp: Math.floor(now / 1000) + 3600, jti: 'ticket-1', ...overrides });
  const input = `${head}.${payload}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
function record(credential = token()): OfflineCredentialRecord {
  return { id: `${subject}:${thirdPartyId}`, subject, thirdPartyId, credential, expiresAt: new Date(now + 3600_000).toISOString(), assignmentIds: [assignmentId],
    assignments: [{ id: assignmentId, thirdPartyId, vehicleId, vehiclePlate: 'ABC123', driver: { id: 'd'.repeat(24), name: 'Ana' }, status: 'ACTIVE',
      startedAt: '2026-11-23T10:00:00Z', endedAt: null, version: 1 }], updatedAt: new Date(now).toISOString() };
}

describe('offline credential verification', () => {
  it('accepts a trusted signature bound to the cached subject, third party and assignment', async () => {
    expect(await verifyOfflineCredential(record(), [publicJwk], now)).toMatchObject({ sub: subject, thirdPartyId, assignmentIds: [assignmentId], scope: 'invoice:offline-capture' });
    expect(await verifyOfflineCredential(record(), [{ ...publicJwk, kid: 'next-key' }, publicJwk], now)).toMatchObject({ sub: subject });
  });
  it('rejects signature edits, wrong subject, wrong assignment scope and expiration', async () => {
    const valid = token();
    const [head, payload, signature] = valid.split('.');
    const editedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), thirdPartyId: 'f'.repeat(24) })).toString('base64url');
    expect(await verifyOfflineCredential(record(`${head}.${editedPayload}.${signature}`), [publicJwk], now)).toBeNull();
    expect(await verifyOfflineCredential({ ...record(), subject: 'other' }, [publicJwk], now)).toBeNull();
    expect(await verifyOfflineCredential(record(token({ exp: Math.floor(now / 1000) - 1 })), [publicJwk], now)).toBeNull();
    expect(await verifyOfflineCredential(record(token({ assignmentIds: ['d'.repeat(24)] })), [publicJwk], now)).toBeNull();
  });
});
