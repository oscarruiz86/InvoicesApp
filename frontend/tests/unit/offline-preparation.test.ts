import { describe, expect, it, vi } from 'vitest';
import { createOfflinePreparation, requestPersistentStorage } from '@/modules/invoices/application/offline-preparation';

describe('offline preparation', () => {
  it('detects granted, denied and unavailable persistent storage', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: vi.fn().mockResolvedValue(true) } });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: vi.fn().mockResolvedValue(false) } });
    await expect(requestPersistentStorage()).resolves.toBe(false);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: vi.fn().mockRejectedValue(new Error()) } });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('does not issue a credential for a non-driver context', async () => {
    const snapshots: unknown[] = [];
    const coordinator = createOfflinePreparation({
      api: { issueOfflineCredential: vi.fn() } as never,
      assignments: {} as never,
      context: { getState: () => ({ status: 'ready', activeContext: {
        kind: 'ORGANIZATION', organizationType: 'THIRD_PARTY', organizationId: 'tp',
        authorization: { subject: 'u', scope: { kind: 'organization', companyId: null, thirdPartyId: 'tp' } },
      } }) } as never,
      authorization: { getState: () => ({ snapshot: { roles: ['COMPANY_ADMIN'] } }) },
      queue: {} as never, publicJwks: [{ kid: 'k' }], verifyCredential: vi.fn(), loadQrDecoder: vi.fn(),
    }, value => snapshots.push(value));
    await coordinator.prepare();
    expect(snapshots.at(-1)).toMatchObject({ state: 'idle' });
    expect((coordinator as { dispose?: () => void }).dispose).toBeTypeOf('function');
    coordinator.dispose();
  });
});
