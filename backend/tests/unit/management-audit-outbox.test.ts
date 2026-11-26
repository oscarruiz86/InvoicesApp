import { describe, expect, it, vi } from 'vitest';
import { createManagementAuditOutboxWorker, type ManagementCapture } from '@/modules/organizations/application/management-audit-outbox-worker';
import type { AuditEvent } from '@/modules/audit/domain/audit-event';

const capture = (overrides: Partial<ManagementCapture> = {}): ManagementCapture => ({ eventId: 'evt-1', correlationId: 'corr-1', at: '2026-01-01T00:00:00.000Z',
  subject: 'admin-1', action: 'COMPANY_UPDATED', companyId: 'company-1', scope: { kind: 'global', companyId: null, thirdPartyId: null },
  beforeVersion: '1', afterVersion: '2', ...overrides });

describe('organization management audit outbox', () => {
  it('maps only normalized facts, preserves event identity and acknowledges after Audit accepts', async () => {
    const acknowledge = vi.fn(async () => undefined); const record = vi.fn(async (_event: AuditEvent) => undefined);
    const worker = createManagementAuditOutboxWorker({ batchSize: 1,
      outbox: { pending: async limit => { expect(limit).toBe(1); return [{ source: 'company_management_events', capture: capture({ before: { documentNumber: 'personal' } } as never) }]; }, acknowledge }, audit: { record } });
    expect(await worker.deliverBatch()).toBe(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt-1', source: 'organizations', action: 'COMPANY_UPDATED',
      resource: { type: 'company', id: 'company-1' }, beforeVersion: '1', afterVersion: '2' }));
    expect(JSON.stringify(record.mock.calls[0][0])).not.toContain('personal');
    expect(acknowledge).toHaveBeenCalledWith('company_management_events', 'evt-1');
  });

  it('retains the capture when Audit is unavailable and acknowledges only after a successful write', async () => {
    const acknowledge = vi.fn(async () => undefined);
    const worker = createManagementAuditOutboxWorker({ outbox: { pending: async () => [{ source: 'third_party_management_events',
      capture: capture({ action: 'THIRD_PARTY_CREATED', companyId: null, thirdPartyId: 'third-1' }) }], acknowledge },
      audit: { record: async () => { throw new Error('AUDIT_UNAVAILABLE'); } } });
    await expect(worker.deliverBatch()).rejects.toThrow('AUDIT_UNAVAILABLE');
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('does not acknowledge invalid captures and enforces a bounded batch size', async () => {
    const acknowledge = vi.fn(async () => undefined);
    const outbox = { pending: async () => [{ source: 'company_management_events' as const, capture: capture({ subject: 'not an opaque id' }) }], acknowledge };
    await expect(createManagementAuditOutboxWorker({ outbox, audit: { record: async () => undefined } }).deliverBatch()).rejects.toThrow('ORGANIZATION_AUDIT_CAPTURE_INVALID');
    expect(acknowledge).not.toHaveBeenCalled();
    expect(() => createManagementAuditOutboxWorker({ outbox, audit: { record: async () => undefined }, batchSize: 251 })).toThrow('ORGANIZATION_AUDIT_BATCH_SIZE_INVALID');
  });

  it('maps invitation lifecycle captures to minimal facts and never copies invitation secrets', async () => {
    let recorded: AuditEvent | undefined;
    const worker = createManagementAuditOutboxWorker({ outbox: { pending: async () => [{ source: 'organization_invitation_events', capture: {
      eventId: 'evt-invitation', at: '2026-01-01T00:00:00.000Z', action: 'INVITATION_ACCEPTED', invitationId: 'invite-1', organizationId: 'third-1',
      actorSubject: 'user-1', version: 2, scope: { kind: 'organization', companyId: null, thirdPartyId: 'third-1' },
      tokenHash: 'must-not-copy', token: 'must-not-copy', roles: ['THIRD_PARTY_ADMIN'],
    } as never }], acknowledge: async () => undefined }, audit: { async record(event) { recorded = event; } } });
    await worker.deliverBatch();
    expect(recorded).toMatchObject({ eventId: 'evt-invitation', correlationId: 'evt-invitation', action: 'INVITATION_ACCEPTED',
      actor: { kind: 'user', subject: 'user-1' }, resource: { type: 'invitation', id: 'invite-1' }, scope: { thirdPartyId: 'third-1' }, afterVersion: '2' });
    expect(JSON.stringify(recorded)).not.toMatch(/tokenHash|must-not-copy|THIRD_PARTY_ADMIN/);
  });
});
