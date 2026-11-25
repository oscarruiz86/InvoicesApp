import { expect, it, vi } from 'vitest';
import { createDrivers, DriverUseCaseError } from '@/modules/fleet/application/drivers';
import type { Driver } from '@/modules/fleet/domain/driver';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { AssignmentPresence } from '@/modules/fleet/application/assignment-ports';

const thirdPartyId = '0123456789abcdef01234567';
const driver: Driver = { id: '1123456789abcdef01234567', subject: 'driver-subject', membershipId: 'membership-1', thirdPartyId,
  status: 'ACTIVE', version: 1, createdAt: new Date('2026-11-19T00:00:00Z'), updatedAt: new Date('2026-11-19T00:00:00Z'), createdBy: 'admin', updatedBy: null };
const actor = (subject: string, roles: AuthenticatedActor['roles']): AuthenticatedActor => ({ subject, roles, username: null, name: null, email: null, permissions: [] });
function fixture(eligible = true) {
  const repository = { list: vi.fn(async () => ({ items: [driver], total: 1 })), find: vi.fn(async () => driver), transition: vi.fn(async () => driver) };
  const authorization = { requirePermission: vi.fn(async (_actor: AuthenticatedActor, _permission: string, scope: unknown) => ({
    policyVersion: 'policy-3', contextRevision: JSON.stringify(scope),
  })) };
  const facts = { eligibility: vi.fn(async () => ({ driverId: driver.id, eligible, driverStatus: driver.status, membershipRevision: 2, thirdPartyRevision: 4 })) };
  const identityProfile = { subject: driver.subject, enabled: true, email: 'driver@example.invalid', emailVerified: true,
    fullName: 'Conductor Uno', documentType: 'CC' as const, documentNumber: '123456', profileComplete: true };
  const identity = { read: vi.fn(async (subject: string) => ({ ...identityProfile, subject })), search: vi.fn(async () => [identityProfile]) };
  const assignments = { readForDriver: vi.fn(async (): Promise<AssignmentPresence> => ({ state: 'CONFIRMED', revision: 'no-active-assignments', hasActive: false })) };
  return { service: createDrivers({ repository, authorization: authorization as never, facts, identity, assignments }), repository, authorization, facts, identity, assignments };
}

it('scopes a third-party administrator list to the explicitly selected third party', async () => {
  const f = fixture();
  const result = await f.service.list(actor('manager', ['THIRD_PARTY_ADMIN']), { thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
  expect(f.authorization.requirePermission).toHaveBeenCalledWith(expect.objectContaining({ subject: 'manager' }), 'drivers:read',
    { kind: 'organization', companyId: null, thirdPartyId });
  expect(f.repository.list).toHaveBeenCalledWith({ thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
  expect(result).toMatchObject({ total: 1, items: [{ driver: { id: driver.id, thirdPartyId, status: 'ACTIVE', version: 1 }, identity: { name: 'Conductor Uno', documentNumber: '123456', email: 'driver@example.invalid' } }] });
  expect(Object.keys(result.items[0].driver).sort()).toEqual(['createdAt', 'id', 'status', 'thirdPartyId', 'updatedAt', 'version']);
});

it('searches active drivers by Identity name and limits the database query to matching subjects', async () => {
  const f = fixture();
  const result = await f.service.list(actor('manager', ['THIRD_PARTY_ADMIN']), {
    thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc', status: 'ACTIVE', q: 'Conductor Uno',
  });
  expect(f.identity.search).toHaveBeenCalledWith({ text: 'Conductor Uno' });
  expect(f.repository.list).toHaveBeenCalledWith(expect.objectContaining({ thirdPartyId, status: 'ACTIVE', q: 'Conductor Uno', subjects: [driver.subject] }));
  expect(result).toMatchObject({ total: 1, items: [{ driver: { id: driver.id }, identity: { name: 'Conductor Uno' } }] });
  expect(f.identity.read).not.toHaveBeenCalled();
});

it('limits a driver to its own subject and third-party membership', async () => {
  const f = fixture();
  await f.service.list(actor('driver-subject', ['DRIVER']), { thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
  expect(f.authorization.requirePermission).toHaveBeenCalledWith(expect.objectContaining({ subject: 'driver-subject' }), 'drivers:read',
    { kind: 'self', companyId: null, thirdPartyId: null });
  expect(f.facts.eligibility).toHaveBeenCalledWith({ subject: 'driver-subject', thirdPartyId });
  expect(f.repository.list).toHaveBeenCalledWith({ thirdPartyId, subject: 'driver-subject', page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' });
  expect(f.repository.find).not.toHaveBeenCalled();
});

it('returns a neutral not-found result to an ineligible driver before querying a resource', async () => {
  const f = fixture(false);
  await expect(f.service.detail(actor('driver-subject', ['DRIVER']), { id: driver.id, thirdPartyId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.repository.find).not.toHaveBeenCalled();
});

it.each([['APP_ADMIN'], ['COMPANY_ADMIN']] as const)('does not grant global or company access to %s', async role => {
  const f = fixture();
  f.authorization.requirePermission.mockRejectedValue(new AuthorizationError());
  await expect(f.service.list(actor('manager', [role]), { thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.authorization.requirePermission).toHaveBeenCalledWith(expect.objectContaining({ subject: 'manager' }), 'drivers:read', { kind: 'organization', companyId: null, thirdPartyId });
  expect(f.repository.list).not.toHaveBeenCalled();
});

it('authorizes state transitions at third-party scope with the current policy receipt', async () => {
  const f = fixture();
  await f.service.transition(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' });
  expect(f.authorization.requirePermission).toHaveBeenCalledWith(expect.objectContaining({ subject: 'manager' }), 'drivers:deactivate',
    { kind: 'organization', companyId: null, thirdPartyId });
  expect(f.repository.transition).toHaveBeenCalledWith(expect.objectContaining({ id: driver.id, thirdPartyId, actorSubject: 'manager',
    expectedVersion: 1, status: 'INACTIVE', assignmentRevision: 'no-active-assignments', policyVersion: 'policy-3', scope: { kind: 'organization', companyId: null, thirdPartyId } }));
  expect(f.assignments.readForDriver).toHaveBeenCalledWith({ driverId: driver.id, thirdPartyId });
});

it('blocks driver deactivation when active assignment evidence exists', async () => {
  const f = fixture();
  f.assignments.readForDriver.mockResolvedValue({ state: 'CONFIRMED', revision: 'active-assignment', hasActive: true });
  await expect(f.service.transition(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' }))
    .rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.repository.transition).not.toHaveBeenCalled();
});

it('fails closed when assignment evidence is unavailable during driver deactivation', async () => {
  const f = fixture();
  f.assignments.readForDriver.mockResolvedValue({ state: 'UNAVAILABLE' });
  await expect(f.service.transition(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' }))
    .rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(f.repository.transition).not.toHaveBeenCalled();
});

it('maps permission denial and invalid pagination before repository access', async () => {
  const denied = fixture();
  denied.authorization.requirePermission.mockRejectedValue(new AuthorizationError());
  await expect(denied.service.list(actor('manager', ['THIRD_PARTY_ADMIN']), { thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
  const invalid = fixture();
  await expect(invalid.service.list(actor('manager', ['THIRD_PARTY_ADMIN']), { thirdPartyId, page: 0, pageSize: 20, sort: 'createdAt', direction: 'desc' }))
    .rejects.toBeInstanceOf(DriverUseCaseError);
  expect(denied.repository.list).not.toHaveBeenCalled();
  expect(invalid.authorization.requirePermission).not.toHaveBeenCalled();
});



it('returns a neutral not-found result for an administrator querying a foreign driver', async () => {
  const f = fixture();
  f.repository.find.mockResolvedValue(null as never);
  await expect(f.service.detail(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.authorization.requirePermission).toHaveBeenCalledOnce();
  expect(f.repository.find).toHaveBeenCalledOnce();
});

it('distinguishes unavailable authorization and stale mutation conflicts', async () => {
  const unavailable = fixture();
  unavailable.authorization.requirePermission.mockRejectedValue(new AuthorizationUnavailable());
  await expect(unavailable.service.list(actor('manager', ['THIRD_PARTY_ADMIN']), { thirdPartyId, page: 1, pageSize: 20, sort: 'createdAt', direction: 'desc' }))
    .rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(unavailable.repository.list).not.toHaveBeenCalled();

  const conflict = fixture();
  conflict.repository.transition.mockRejectedValue({ code: 'VERSION_CONFLICT' });
  await expect(conflict.service.transition(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' }))
    .rejects.toMatchObject({ code: 'CONFLICT' });
});

it('returns a nullable Identity projection when the provider has no profile', async () => {
  const f = fixture();
  f.identity.read.mockRejectedValue(new Error('identity unavailable'));
  await expect(f.service.detail(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId }))
    .resolves.toMatchObject({ driver: { id: driver.id, thirdPartyId, status: 'ACTIVE', version: 1 }, identity: null });
});



it('returns the sanitized read-only projection after a state transition', async () => {
  const f = fixture();
  const result = await f.service.transition(actor('manager', ['THIRD_PARTY_ADMIN']), { id: driver.id, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' });
  expect(result).toMatchObject({ driver: { id: driver.id, thirdPartyId, status: 'ACTIVE', version: 1 }, identity: { name: 'Conductor Uno' } });
  expect(Object.keys(result.driver).sort()).toEqual(['createdAt', 'id', 'status', 'thirdPartyId', 'updatedAt', 'version']);
});
