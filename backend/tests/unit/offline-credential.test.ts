import { describe, expect, it, vi } from 'vitest';
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { createOfflineCredentialIssuer, OfflineCredentialError } from '@/modules/invoice-sync/application/offline-credential';
import { createOfflineCredentialSigner } from '@/modules/invoice-sync/infrastructure/offline-credential-signer';

const id = (digit: string) => digit.repeat(24);
const actor = { subject: 'driver-subject', username: null, name: null, email: null, roles: ['DRIVER'] as const, permissions: [] };
const assignments = [{ assignmentId: id('a'), vehicleId: id('b') }, { assignmentId: id('c'), vehicleId: id('d') }];
const now = new Date('2026-11-23T12:00:00.987Z');

describe('offline credential issuance', () => {
  it('issues a short ES256 credential bound to the driver, third party, scope and active assignments', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const privateKey = await exportPKCS8(pair.privateKey);
    const publicKey = await importSPKI(await exportSPKI(pair.publicKey), 'ES256');
    const publicJwk = await exportJWK(pair.publicKey);
    const signer = createOfflineCredentialSigner({ keyFile: '/private/offline-key', keyId: 'offline-v1', secrets: { read: async () => privateKey } });
    const service = createOfflineCredentialIssuer({ authorization: { authorize: vi.fn(async () => ({ roles: ['DRIVER' as const], policyVersion: '1', contextRevision: '1' })) },
      assignments: { readOwnActive: vi.fn(async input => ({ assignmentId: input.assignmentId, thirdPartyId: input.thirdPartyId,
        vehicleId: input.vehicleId, driverId: id('e'), subject: actor.subject, assignmentVersion: 1, vehicleVersion: 1, driverVersion: 1, vehiclePlate: null })) },
      signer, clock: { now: () => now } });
    const result = await service.issue(actor, { thirdPartyId: id('f'), assignments, ttlHours: 72 });
    const verified = await jwtVerify(result.credential, publicKey, { algorithms: ['ES256'], issuer: 'invoice-app', audience: 'invoice-offline-capture', currentDate: now });
    expect(verified.protectedHeader).toMatchObject({ alg: 'ES256', kid: 'offline-v1' });
    expect(verified.payload).toMatchObject({ sub: actor.subject, thirdPartyId: id('f'), assignmentIds: assignments.map(value => value.assignmentId), scope: 'invoice:offline-capture', exp: Math.floor(now.getTime() / 1000) + 72 * 3600 });
    expect(publicJwk).not.toHaveProperty('d');
    expect(result.expiresAt).toBe(new Date((Math.floor(now.getTime() / 1000) + 72 * 3600) * 1000).toISOString());
    expect(Date.parse(result.expiresAt) / 1000).toBe(verified.payload.exp);
  });

  it('denies non-drivers, invalid assignments and duplicate scopes', async () => {
    const service = createOfflineCredentialIssuer({ authorization: { authorize: async () => ({ roles: ['THIRD_PARTY_ADMIN'], policyVersion: '1', contextRevision: '1' }) },
      assignments: { readOwnActive: async () => null }, signer: { sign: async () => 'signed' }, clock: { now: () => now } });
    await expect(service.issue(actor, { thirdPartyId: id('f'), assignments, ttlHours: 8 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const driverService = createOfflineCredentialIssuer({ authorization: { authorize: async () => ({ roles: ['DRIVER'], policyVersion: '1', contextRevision: '1' }) },
      assignments: { readOwnActive: async () => null }, signer: { sign: async () => 'signed' }, clock: { now: () => now } });
    await expect(driverService.issue(actor, { thirdPartyId: id('f'), assignments, ttlHours: 8 })).rejects.toBeInstanceOf(OfflineCredentialError);
    await expect(driverService.issue(actor, { thirdPartyId: id('f'), assignments: [assignments[0]!, assignments[0]!], ttlHours: 8 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('rejects a lifetime above the hard 72 hour limit', async () => {
    const service = createOfflineCredentialIssuer({ authorization: { authorize: async () => ({ roles: ['DRIVER'], policyVersion: '1', contextRevision: '1' }) },
      assignments: { readOwnActive: async input => ({ assignmentId: input.assignmentId, thirdPartyId: input.thirdPartyId, vehicleId: input.vehicleId,
        driverId: id('e'), subject: actor.subject, assignmentVersion: 1, vehicleVersion: 1, driverVersion: 1, vehiclePlate: null }) },
      signer: { sign: async () => 'signed' }, clock: { now: () => now } });
    await expect(service.issue(actor, { thirdPartyId: id('f'), assignments, ttlHours: 73 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
