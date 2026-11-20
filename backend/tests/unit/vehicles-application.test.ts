import { expect, it, vi } from 'vitest';
import { createVehicles } from '@/modules/fleet/application/vehicles';
import { unavailableAssignments } from '@/modules/fleet/infrastructure/unavailable-assignments';
import { createVehicle } from '@/modules/fleet/domain/vehicle';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { AssignmentEvidence } from '@/modules/fleet/application/vehicle-ports';
const thirdPartyId = 'a'.repeat(24), vehicleId = 'b'.repeat(24);
const actor: AuthenticatedActor = { subject: 'actor', roles: ['APP_ADMIN'], permissions: [], username: null, name: null, email: null };
const vehicle = createVehicle({ id: vehicleId, thirdPartyId, fields: { plate: 'ABC123', internalNumber: '001', propertyCardNumber: '0001' }, actor: 'actor', now: new Date() });
function fixture(roles: string[] = ['THIRD_PARTY_ADMIN'], permissions = ['vehicles:read', 'vehicles:create', 'vehicles:update', 'vehicles:deactivate']) {
  const repository = { list: vi.fn(async () => ({ items: [vehicle], total: 1 })), find: vi.fn(async () => vehicle), create: vi.fn(async () => vehicle), update: vi.fn(async () => vehicle), transition: vi.fn(async () => vehicle) };
  const assignments = { read: vi.fn(async (): Promise<AssignmentEvidence> => ({ state: 'UNAVAILABLE' })) };
  const authorization = { getEffectivePermissions: vi.fn(async () => ({ roles, permissions, policyVersion: '1', contextRevision: 'rev' })), requirePermission: vi.fn(async () => ({ policyVersion: '1', contextRevision: 'rev' })) };
  const drivers = { eligibility: vi.fn(async () => ({ driverId: 'driver', eligible: true, driverStatus: 'ACTIVE' as 'ACTIVE' | 'INACTIVE', membershipRevision: 1, thirdPartyRevision: 1 })) };
  const policies = { read: vi.fn(async () => ({ version: '1', grants: roles.flatMap(role => permissions.map(permission => ({ role, permission, scope: 'third-party' }))) })) };
  return { repository, assignments, authorization, drivers, policies, service: createVehicles({ repository, assignments, authorization: authorization as never, policies: policies as never, drivers, correlationId: () => 'correlation' }) };
}
const list = { thirdPartyId, page: 1, pageSize: 20, sort: 'plate' as const, direction: 'asc' as const };
it('uses effective local capabilities, ignoring JWT role claims; admin is independent of assignments', async () => {
  const f = fixture();
  expect(await f.service.list(actor, list)).toMatchObject({ total: 1, items: [{ assignmentState: 'UNAVAILABLE', currentDriver: null }] });
  await f.service.create(actor, { thirdPartyId, fields: { plate: vehicle.plate, internalNumber: vehicle.internalNumber, propertyCardNumber: vehicle.propertyCardNumber } });
});
it('denies permission before looking up existence and hides inaccessible IDs', async () => {
  const f = fixture(['THIRD_PARTY_ADMIN'], []);
  await expect(f.service.detail(actor, { id: vehicleId, thirdPartyId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.repository.find).not.toHaveBeenCalled();
  const other = fixture(); other.repository.find.mockResolvedValue(null as never);
  await expect(other.service.detail(actor, { id: vehicleId, thirdPartyId })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});
it('fails closed for DRIVER and deactivation while assignment provider is absent', async () => {
  const driver = fixture(['DRIVER']);
  await expect(driver.service.list(actor, list)).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  expect(driver.repository.list).not.toHaveBeenCalled();
  const admin = fixture();
  await expect(admin.service.transition(actor, { id: vehicleId, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' })).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  expect(admin.repository.transition).not.toHaveBeenCalled();
  await expect(unavailableAssignments.confirmNoOpen({ vehicleId, thirdPartyId, revision: '1' })).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
});
it('filters own eligible assignments before pagination and excludes inactive drivers', async () => {
  const f = fixture(['DRIVER']);
  f.assignments.read.mockResolvedValue({ state: 'CONFIRMED', revision: 'r1', assignments: [
    { vehicleId, thirdPartyId, subject: actor.subject, driverId: 'driver', driverName: 'Conductor' },
    { vehicleId: 'c'.repeat(24), thirdPartyId, subject: 'other', driverId: 'driver', driverName: 'Conductor' },
    { vehicleId: 'd'.repeat(24), thirdPartyId: 'e'.repeat(24), subject: actor.subject, driverId: 'driver', driverName: 'Conductor' },
  ] });
  await f.service.list(actor, list);
  expect(f.repository.list).toHaveBeenLastCalledWith({ ...list, assignedVehicleIds: [vehicleId] });
  f.drivers.eligibility.mockResolvedValue({ driverId: 'driver', eligible: false, driverStatus: 'INACTIVE', membershipRevision: 2, thirdPartyRevision: 1 });
  await f.service.list(actor, list);
  expect(f.repository.list).toHaveBeenLastCalledWith({ ...list, assignedVehicleIds: [] });
});
it('uses admin access for a complete dual capability and denies implicit global/company privileges', async () => {
  for (const roles of [['APP_ADMIN'], ['COMPANY_ADMIN']]) await expect(fixture(roles).service.list(actor, list)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const f = fixture(['DRIVER', 'THIRD_PARTY_ADMIN']);
  await f.service.list({ ...actor, roles: ['DRIVER'] }, list);
  expect(f.repository.list).toHaveBeenCalledWith({ ...list, assignedVehicleIds: undefined });
});
it('distinguishes open assignments, confirmed absence and unknown provider', async () => {
  const f = fixture();
  f.assignments.read.mockResolvedValue({ state: 'CONFIRMED', revision: 'r1', assignments: [{ vehicleId, thirdPartyId, subject: 'driver', driverId: 'driver', driverName: 'Conductor' }] });
  const input = { id: vehicleId, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' as const };
  await expect(f.service.transition(actor, input)).rejects.toMatchObject({ code: 'VEHICLE_HAS_OPEN_ASSIGNMENT' });
  f.assignments.read.mockResolvedValue({ state: 'CONFIRMED', revision: 'r2', assignments: [] });
  await f.service.transition(actor, input);
  expect(f.repository.transition).toHaveBeenCalledWith(expect.objectContaining({ assignmentRevision: 'r2' }));
});
it('keeps a version-current inactive no-op independent of the unavailable provider', async () => {
  const f = fixture(); f.repository.find.mockResolvedValue({ ...vehicle, status: 'INACTIVE' });
  await f.service.transition(actor, { id: vehicleId, thirdPartyId, expectedVersion: 1, status: 'INACTIVE' });
  expect(f.repository.transition).toHaveBeenCalledWith(expect.objectContaining({ assignmentRevision: undefined }));
});
it('does not combine a DRIVER grant with an administrative role to broaden read access', async () => {
  const f = fixture(['THIRD_PARTY_ADMIN', 'DRIVER'], ['vehicles:read']);
  f.policies.read.mockResolvedValue({ version: '1', grants: [{ role: 'DRIVER', permission: 'vehicles:read', scope: 'third-party' }] });
  await expect(f.service.list(actor, list)).rejects.toMatchObject({ code: 'ASSIGNMENT_PROVIDER_UNAVAILABLE' });
  expect(f.repository.list).not.toHaveBeenCalled();
});
it('fails closed when policy or context revisions change during authorization', async () => {
  const f = fixture(); f.policies.read.mockResolvedValue({ version: '2', grants: [] });
  await expect(f.service.list(actor, list)).rejects.toMatchObject({ code: 'AUTHORIZATION_UNAVAILABLE' });
  expect(f.repository.list).not.toHaveBeenCalled();
  const changed = fixture(); changed.authorization.requirePermission.mockResolvedValue({ policyVersion: '1', contextRevision: 'changed' });
  await expect(changed.service.list(actor, list)).rejects.toMatchObject({ code: 'AUTHORIZATION_UNAVAILABLE' });
  expect(changed.repository.list).not.toHaveBeenCalled();
});

