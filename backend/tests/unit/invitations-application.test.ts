import { expect, it, vi } from 'vitest';
import { createInvitations } from '@/modules/organizations/application/invitations';
import type { Invitation } from '@/modules/organizations/domain/invitations';
import type { OrganizationReader } from '@/modules/organizations/application/context-ports';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { IdentityProfileUnavailable } from '@/modules/identity/application/identity-profile-reader';
const now = new Date('2026-11-13T12:00:00.000Z');
const actor: AuthenticatedActor = { subject: 'admin', username: null, name: null, email: 'admin@example.invalid', roles: [], permissions: [] };
const organization = { id: 'company-1', type: 'COMPANY' as const, name: 'Empresa', active: true, revision: 1 };
function fixture() {
  let current: Invitation | null = null;
  const organizations: OrganizationReader = { candidates: async () => [], find: async id => id === organization.id ? organization : null, read: async () => null };
  const repository = {
    createPending: vi.fn(async (value: Invitation) => { current = value; return value; }), findInvitation: vi.fn(async () => current),
    findInvitationByToken: vi.fn(async () => current), listInvitations: vi.fn(async () => ({ items: current ? [current] : [], total: current ? 1 : 0 })),
    listReceivedInvitations: vi.fn(async () => ({ items: current ? [current] : [], total: current ? 1 : 0 })),
    updateDeliveryStatus: vi.fn(async () => current!),
    resendPending: vi.fn(async () => current!), resolveInvitation: vi.fn(async () => current!),
    accept: vi.fn(async () => ({ invitation: { ...current!, status: 'ACCEPTED' as const }, membership: { id: 'membership-1', revision: 1 } })),
  };
  const driverProvisioning = { provision: vi.fn(async () => {}), synchronizeRoles: vi.fn(async () => {}) };
  const token = 'A'.repeat(43);
  const service = createInvitations({ repository, organizations, authorization: { requirePermission: vi.fn(async () => ({ policyVersion: '1', contextRevision: null })) } as never,
    identity: { read: async subject => ({ subject, enabled: true, email: 'person@example.invalid', emailVerified: true, fullName: 'Nombre Apellido',
      documentType: 'CC', documentNumber: '123456', profileComplete: true }) }, now: () => now, nextId: (() => { let id = 0; return () => `id-${++id}`; })(),
    ttlHours: 72, issueCredential: () => ({ token, tokenHash: 'a'.repeat(64), expiresAt: new Date(now.getTime() + 72 * 3600000) }), authorizeDelegation: vi.fn(async () => {}), driverProvisioning });
  return { service, repository, token, driverProvisioning };
}
it('enqueues a normalized invitation and returns without waiting for SMTP or exposing its token', async () => {
  const f = fixture();
  const result = await f.service.create(actor, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: ' Person@Example.Invalid ', roles: ['COMPANY_ADMIN'] });
  expect(result).toMatchObject({ recipientEmail: 'person@example.invalid', status: 'PENDING', deliveryStatus: 'UNKNOWN', version: 1 });
  expect(JSON.stringify(result)).not.toContain(f.token); expect(JSON.stringify(result)).not.toContain('tokenHash'); expect(JSON.stringify(result)).not.toContain('attemptId');
  expect(f.repository.createPending).toHaveBeenCalledOnce();
  expect(f.repository.createPending).toHaveBeenCalledWith(expect.any(Object), now, expect.objectContaining({ type: 'INVITATION_CREATED', token: f.token, recipient: 'person@example.invalid', organizationName: 'Empresa' }));
});
it('previews and accepts using the current verified identity', async () => {
  const f = fixture(); await f.service.create(actor, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'] });
  const preview = await f.service.preview(f.token); expect(preview).toMatchObject({ organizationName: 'Empresa', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'], version: 1 });
  expect(JSON.stringify(preview)).not.toContain('tokenHash');
  const accepted = await f.service.accept({ ...actor, subject: 'invitee' }, f.token, 1);
  expect(accepted).toMatchObject({ invitation: { status: 'ACCEPTED' }, membershipId: 'membership-1', membershipRevision: 1 });
  expect(f.repository.accept).toHaveBeenCalledWith(expect.objectContaining({ emailVerified: true, profileComplete: true, expectedVersion: 1, subject: 'invitee', driverProvisioning: f.driverProvisioning }));
});
it('lets an authenticated recipient recover and accept a pending invitation without its URL token', async () => {
  const f = fixture(); await f.service.create(actor, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'] });
  const inbox = await f.service.received({ ...actor, subject: 'invitee' }, { page: 1, pageSize: 20 });
  expect(inbox).toMatchObject({ items: [{ organizationName: 'Empresa', roles: ['COMPANY_ADMIN'], status: 'PENDING' }], total: 1 });
  expect(f.repository.listReceivedInvitations).toHaveBeenCalledWith({ recipientEmail: 'person@example.invalid', page: 1, pageSize: 20, now });
  expect(JSON.stringify(inbox)).not.toContain('person@example.invalid');
  expect(await f.service.acceptReceived({ ...actor, subject: 'invitee' }, 'id-1', 1)).toMatchObject({ invitation: { status: 'ACCEPTED' }, membershipId: 'membership-1' });
});
it('keeps identity provider outages distinct from identity mismatch', async () => {
  const f = fixture(); await f.service.create(actor, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'] });
  const service = createInvitations({ repository: f.repository, organizations: { candidates: async () => [], find: async () => organization, read: async () => null },
    authorization: { requirePermission: async () => ({ policyVersion: '1', contextRevision: null }) } as never,
    identity: { read: async () => { throw new IdentityProfileUnavailable(); } }, now: () => now, nextId: () => 'id', ttlHours: 72,
    issueCredential: () => ({ token: f.token, tokenHash: 'b'.repeat(64), expiresAt: new Date(now.getTime() + 3600000) }), authorizeDelegation: async () => {} });
  await expect(service.accept({ ...actor, subject: 'invitee' }, f.token, 1)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
