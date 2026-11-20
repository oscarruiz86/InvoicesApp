import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { PolicyReader } from '@/modules/identity/application/authorization-ports';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { Permission } from '@/modules/identity/domain/permissions';
import type { DriverFactsReader } from './driver-ports';
import type { AssignmentAccessReader, AssignmentEvidence, VehicleAuthority, VehicleListQuery, VehicleRepository, VehicleView } from './vehicle-ports';
import { normalizeVehicleFields, VehicleError, type Vehicle, type VehicleFields, type VehicleStatus } from '../domain/vehicle';
export type VehicleErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND' | 'VEHICLE_VERSION_CONFLICT' | 'VEHICLE_IDENTIFIER_CONFLICT' | 'VEHICLE_HAS_OPEN_ASSIGNMENT' | 'AUTHORIZATION_UNAVAILABLE' | 'VEHICLE_STORAGE_UNAVAILABLE' | 'ASSIGNMENT_PROVIDER_UNAVAILABLE';
export class VehicleUseCaseError extends Error { constructor(readonly code: VehicleErrorCode) { super(code); } }
export function vehicleFailure(error: unknown): never {
  if (error instanceof VehicleUseCaseError) throw error;
  if (error instanceof VehicleError) throw new VehicleUseCaseError(error.code);
  if (error instanceof AuthorizationError) throw new VehicleUseCaseError('FORBIDDEN');
  if (error instanceof AuthorizationUnavailable) throw new VehicleUseCaseError('AUTHORIZATION_UNAVAILABLE');
  throw new VehicleUseCaseError('VEHICLE_STORAGE_UNAVAILABLE');
}
const id = (value: string) => { if (!/^[a-f0-9]{24}$/.test(value)) throw new VehicleUseCaseError('INVALID_REQUEST'); };
const scope = (thirdPartyId: string) => ({ kind: 'organization' as const, companyId: null, thirdPartyId });
export function createVehicles(deps: { repository: VehicleRepository; assignments: AssignmentAccessReader; drivers: DriverFactsReader; authorization: Authorization; policies: PolicyReader; correlationId: () => string }) {
  async function authorize(actor: AuthenticatedActor, thirdPartyId: string, permission: Permission, mutation = false) {
    id(thirdPartyId);
    try {
      const selected = scope(thirdPartyId);
      const snapshot = await deps.authorization.getEffectivePermissions(actor, selected);
      const policy = await deps.policies.read();
      const receipt = await deps.authorization.requirePermission(actor, permission, selected);
      if (policy.version !== snapshot.policyVersion || receipt.policyVersion !== snapshot.policyVersion || receipt.contextRevision !== snapshot.contextRevision) throw new VehicleUseCaseError('AUTHORIZATION_UNAVAILABLE');
      if (!snapshot.permissions.includes(permission)) throw new VehicleUseCaseError('FORBIDDEN');
      const granted = (role: 'THIRD_PARTY_ADMIN' | 'DRIVER') => snapshot.roles.includes(role) && policy.grants.some(grant => grant.role === role && grant.permission === permission && grant.scope === 'third-party');
      const admin = granted('THIRD_PARTY_ADMIN');
      if (!admin && (mutation || !granted('DRIVER'))) throw new VehicleUseCaseError('FORBIDDEN');
      return { admin, authority: { subject: actor.subject, thirdPartyId, policyVersion: snapshot.policyVersion, contextRevision: snapshot.contextRevision } satisfies VehicleAuthority };
    } catch (error) { return vehicleFailure(error); }
  }
  async function evidence(input: { thirdPartyId: string; subject?: string; vehicleId?: string }): Promise<AssignmentEvidence> {
    try { return await deps.assignments.read(input); } catch { return { state: 'UNAVAILABLE' }; }
  }
  async function readAccess(actor: AuthenticatedActor, thirdPartyId: string) {
    const { admin } = await authorize(actor, thirdPartyId, 'vehicles:read');
    if (admin) return { admin, assignedVehicleIds: undefined };
    const assignments = await evidence({ thirdPartyId, subject: actor.subject });
    if (assignments.state === 'UNAVAILABLE') throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
    const driver = await deps.drivers.eligibility({ subject: actor.subject, thirdPartyId });
    return { admin, assignedVehicleIds: driver.eligible && driver.driverId ? assignments.assignments.filter(a => a.subject === actor.subject && a.thirdPartyId === thirdPartyId && a.driverId === driver.driverId).map(a => a.vehicleId) : [] };
  }
  async function view(vehicle: Vehicle): Promise<VehicleView> {
    const assignments = await evidence({ thirdPartyId: vehicle.thirdPartyId, vehicleId: vehicle.id });
    const current = assignments.state === 'CONFIRMED' ? assignments.assignments.find(a => a.vehicleId === vehicle.id && a.thirdPartyId === vehicle.thirdPartyId) : undefined;
    return { ...vehicle, currentDriver: current ? { id: current.driverId, name: current.driverName } : null,
      assignmentState: assignments.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : current ? 'ASSIGNED' : 'UNASSIGNED' };
  }
  const mutation = (authority: VehicleAuthority) => ({ authority, correlationId: deps.correlationId() });
  return {
    async list(actor: AuthenticatedActor, input: VehicleListQuery) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
        || !['plate', 'internalNumber', 'propertyCardNumber', 'status', 'createdAt'].includes(input.sort) || !['asc', 'desc'].includes(input.direction)
        || (input.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(input.status)) || (input.q !== undefined && (!input.q.trim() || input.q.length > 100))) throw new VehicleUseCaseError('INVALID_REQUEST');
      try {
        const access = await readAccess(actor, input.thirdPartyId);
        const result = await deps.repository.list({ ...input, assignedVehicleIds: access.assignedVehicleIds });
        return { items: await Promise.all(result.items.map(view)), total: result.total, page: input.page, pageSize: input.pageSize };
      } catch (error) { return vehicleFailure(error); }
    },
    async detail(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string }) {
      id(input.id);
      try {
        const access = await readAccess(actor, input.thirdPartyId);
        const vehicle = await deps.repository.find({ ...input, assignedVehicleIds: access.assignedVehicleIds });
        if (!vehicle) throw new VehicleUseCaseError('RESOURCE_NOT_FOUND');
        return await view(vehicle);
      } catch (error) { return vehicleFailure(error); }
    },
    async create(actor: AuthenticatedActor, input: { thirdPartyId: string; fields: VehicleFields }) {
      try {
        const { authority } = await authorize(actor, input.thirdPartyId, 'vehicles:create', true);
        return await view(await deps.repository.create({ ...mutation(authority), fields: normalizeVehicleFields(input.fields) }));
      } catch (error) { return vehicleFailure(error); }
    },
    async update(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string; expectedVersion: number; changes: Partial<VehicleFields> }) {
      id(input.id);
      try {
        const { authority } = await authorize(actor, input.thirdPartyId, 'vehicles:update', true);
        return await view(await deps.repository.update({ ...mutation(authority), id: input.id, expectedVersion: input.expectedVersion, changes: input.changes }));
      } catch (error) { return vehicleFailure(error); }
    },
    async transition(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string; expectedVersion: number; status: VehicleStatus }) {
      id(input.id);
      try {
        const { authority } = await authorize(actor, input.thirdPartyId, 'vehicles:deactivate', true);
        const vehicle = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId });
        if (!vehicle) throw new VehicleUseCaseError('RESOURCE_NOT_FOUND');
        if (vehicle.version !== input.expectedVersion) throw new VehicleUseCaseError('VEHICLE_VERSION_CONFLICT');
        let assignmentRevision: string | undefined;
        if (input.status === 'INACTIVE' && vehicle.status !== input.status) {
          const assignments = await evidence({ thirdPartyId: input.thirdPartyId, vehicleId: input.id });
          if (assignments.state === 'UNAVAILABLE') throw new VehicleUseCaseError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
          if (assignments.assignments.some(a => a.vehicleId === input.id && a.thirdPartyId === input.thirdPartyId)) throw new VehicleUseCaseError('VEHICLE_HAS_OPEN_ASSIGNMENT');
          assignmentRevision = assignments.revision;
        }
        return await view(await deps.repository.transition({ ...mutation(authority), id: input.id, expectedVersion: input.expectedVersion, status: input.status, assignmentRevision }));
      } catch (error) { return vehicleFailure(error); }
    },
  };
}
