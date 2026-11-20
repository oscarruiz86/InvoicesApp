import { expect, it, vi } from 'vitest';
import { createAssignmentAuthorizationPort } from '@/modules/fleet/application/assignment-authorization';
import { createAssignments } from '@/modules/fleet/application/assignments';
import type { AssignmentRepositoryPort } from '@/modules/fleet/application/assignment-ports';

const thirdPartyId = 'a'.repeat(24);
const actor = { subject: 'actor-subject', username: null, name: null, email: null, roles: [], permissions: [] };
const policy = { version: 'policy-v1', grants: [
  { role: 'THIRD_PARTY_ADMIN', permission: 'assignments:read', scope: 'third-party' },
  { role: 'THIRD_PARTY_ADMIN', permission: 'vehicles:assign', scope: 'third-party' },
  { role: 'THIRD_PARTY_ADMIN', permission: 'vehicles:unassign', scope: 'third-party' },
  { role: 'DRIVER', permission: 'assignments:read', scope: 'third-party' },
] };

function authorizationFor(roles: string[]) {
  return {
    getEffectivePermissions: vi.fn(async (_actor: unknown, scope: unknown) => ({ subject: actor.subject, scope, roles,
      permissions: ['assignments:read', 'vehicles:assign', 'vehicles:unassign'], policyVersion: policy.version,
      contextRevision: 'context-v4', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 })),
    requirePermission: vi.fn(async () => ({ policyVersion: policy.version, contextRevision: 'context-v4' })),
  };
}

it('authorizes only a third-party admin or a driver for assignment reads', async () => {
  const adminPort = createAssignmentAuthorizationPort({ authorization: authorizationFor(['THIRD_PARTY_ADMIN']) as never, policies: { read: async () => policy } as never });
  await expect(adminPort.authorize({ actor, thirdPartyId, permission: 'assignments:read' })).resolves.toMatchObject({ roles: ['THIRD_PARTY_ADMIN'] });

  const driverPort = createAssignmentAuthorizationPort({ authorization: authorizationFor(['DRIVER']) as never, policies: { read: async () => policy } as never });
  await expect(driverPort.authorize({ actor, thirdPartyId, permission: 'assignments:read' })).resolves.toMatchObject({ roles: ['DRIVER'] });
  await expect(driverPort.authorize({ actor, thirdPartyId, permission: 'vehicles:assign' })).rejects.toThrow('FORBIDDEN');
});

it('does not grant implicit assignment access to APP_ADMIN or COMPANY_ADMIN', async () => {
  for (const role of ['APP_ADMIN', 'COMPANY_ADMIN']) {
    const port = createAssignmentAuthorizationPort({ authorization: authorizationFor([role]) as never, policies: { read: async () => policy } as never });
    await expect(port.authorize({ actor, thirdPartyId, permission: 'assignments:read' })).rejects.toThrow('FORBIDDEN');
  }
});

it('forces drivers to their own ACTIVE assignments and hides out-of-scope details', async () => {
  const repository = { list: vi.fn(async () => ({ items: [], total: 0 })), find: vi.fn(async () => null) } as unknown as AssignmentRepositoryPort;
  const service = createAssignments({ repository, authorization: { authorize: async () => ({ roles: ['DRIVER'], policyVersion: 'v1', contextRevision: 'ctx' }) },
    drivers: { read: vi.fn() }, vehicles: { read: vi.fn() }, ids: { next: () => 'b'.repeat(24) }, clock: { now: () => new Date() }, correlationId: () => 'correlation' });
  await service.list(actor, { thirdPartyId, page: 1, pageSize: 20, sort: 'startedAt', direction: 'desc', status: 'CLOSED', subject: 'other-subject' });
  expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ thirdPartyId, status: 'ACTIVE', subject: actor.subject }));
  await expect(service.detail(actor, { id: 'c'.repeat(24), thirdPartyId })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  expect(repository.find).toHaveBeenCalledWith({ id: 'c'.repeat(24), thirdPartyId, subject: actor.subject, activeOnly: true });
});
