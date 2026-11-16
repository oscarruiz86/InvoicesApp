import { expect, it, vi } from 'vitest';
import { createMemberships } from '@/modules/organizations/application/memberships';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Membership } from '@/modules/organizations/domain/invitations';

const actor: AuthenticatedActor = { subject: 'admin', username: null, name: null, email: null, roles: ['COMPANY_ADMIN'], permissions: [] };
const membership: Membership = { id: 'membership-1', subject: 'member', organizationId: 'company-1', status: 'ACTIVE', origin: 'LEGACY',
  acceptedInvitationId: null, acceptedAt: null, revision: 1 };

it('authorizes the organization before scoped pagination and returns exactly four profile fields', async () => {
  const order: string[] = [];
  const identity = { read: vi.fn(async subject => ({ subject, enabled: true, profileComplete: true, email: 'member@example.invalid', emailVerified: true,
    fullName: 'Nombre Apellido', documentType: 'CC' as const, documentNumber: '123456', username: 'private-login', attributes: { private: 'data' } })) };
  const repository = { listMemberships: vi.fn(async (input: { organizationId: string }) => {
    order.push('list'); expect(input.organizationId).toBe('company-1'); return { items: [{ membership, roles: ['DRIVER' as const] }], total: 1 };
  }) };
  const service = createMemberships({ repository: repository as never,
    organizations: { find: async (id: string) => { order.push('organization'); return id === 'company-1' ? { id, type: 'COMPANY' as const, name: 'Empresa', active: true, revision: 1 } : null; } } as never,
    authorization: { requirePermission: async () => { order.push('authorize'); return { policyVersion: '1', contextRevision: '1' }; } } as never, identity: identity as never,
    now: () => new Date(), authorizeDelegation: async () => {} });
  const result = await service.list(actor, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null, page: 2, pageSize: 10 });
  expect(order).toEqual(['organization', 'authorize', 'list']);
  expect(repository.listMemberships).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 10, organizationId: 'company-1' }));
  expect(result.items[0].profile).toEqual({ fullName: 'Nombre Apellido', documentType: 'CC', documentNumber: '123456', email: 'member@example.invalid' });
  expect(Object.keys(result.items[0].profile!).sort()).toEqual(['documentNumber', 'documentType', 'email', 'fullName']);
});
