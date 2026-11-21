import { describe, expect, it, vi } from 'vitest';
import { createInvoiceAuthorizationPort } from '@/modules/invoices/application/invoice-authorization';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';

const actor: AuthenticatedActor = { subject: 'subject', username: null, name: null, email: null, roles: [], permissions: [] };
const thirdPartyId = 'a'.repeat(24);
function fixture(roles: readonly AuthenticatedActor['roles'][number][], permissionRoles = roles) {
  const snapshot = { subject: actor.subject, scope: { kind: 'organization' as const, companyId: null, thirdPartyId }, roles,
    permissions: ['invoices:read', 'invoices:create', 'invoices:update'] as const, policyVersion: 'p1', contextRevision: 'c1',
    evaluatedAt: '2026-11-20T12:00:00.000Z', refreshAfterSeconds: 30 };
  const authorization = { getEffectivePermissions: vi.fn(async () => snapshot), requirePermission: vi.fn(async () => ({ policyVersion: 'p1', contextRevision: 'c1' })) };
  const policies = { read: vi.fn(async () => ({ version: 'p1', grants: permissionRoles.flatMap(role => ['invoices:read', 'invoices:create', 'invoices:update']
    .map(permission => ({ role, permission, scope: 'third-party' as const }))) })) };
  return { port: createInvoiceAuthorizationPort({ authorization: authorization as never, policies: policies as never }), authorization };
}

describe('invoice authorization port', () => {
  it('allows only driver and third-party admin for reads and updates', async () => {
    for (const role of ['DRIVER', 'THIRD_PARTY_ADMIN'] as const) {
      const { port } = fixture([role]);
      await expect(port.authorize({ actor, thirdPartyId, permission: 'invoices:read' })).resolves.toMatchObject({ roles: [role] });
      await expect(port.authorize({ actor, thirdPartyId, permission: 'invoices:update' })).resolves.toMatchObject({ roles: [role] });
    }
    for (const role of ['APP_ADMIN', 'COMPANY_ADMIN'] as const) {
      const { port } = fixture([role]);
      await expect(port.authorize({ actor, thirdPartyId, permission: 'invoices:read' })).rejects.toThrow();
    }
  });
  it('requires DRIVER for create and matching live policy/context revisions', async () => {
    const admin = fixture(['THIRD_PARTY_ADMIN']);
    await expect(admin.port.authorize({ actor, thirdPartyId, permission: 'invoices:create' })).rejects.toThrow();
    const stale = fixture(['DRIVER']);
    stale.authorization.requirePermission.mockResolvedValueOnce({ policyVersion: 'p1', contextRevision: 'old' });
    await expect(stale.port.authorize({ actor, thirdPartyId, permission: 'invoices:read' })).rejects.toThrow();
  });
});
