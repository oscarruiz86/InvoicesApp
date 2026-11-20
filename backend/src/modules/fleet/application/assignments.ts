import { AssignmentError, closeAssignment, createAssignment, type Assignment, type AssignmentStatus } from '../domain/assignment';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { AssignmentAuthorizationPort, AssignmentDriverEligibility, AssignmentListQuery, AssignmentRepositoryPort, AssignmentVehicleEligibility } from './assignment-ports';

export type AssignmentUseCaseErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND'
  | 'ASSIGNMENT_VERSION_CONFLICT' | 'ACTIVE_ASSIGNMENT_CONFLICT' | 'DRIVER_NOT_ELIGIBLE'
  | 'VEHICLE_NOT_ELIGIBLE' | 'AUTHORIZATION_UNAVAILABLE' | 'ASSIGNMENT_STORAGE_UNAVAILABLE'
  | 'ASSIGNMENT_AUDIT_UNAVAILABLE';

export class AssignmentUseCaseError extends Error {
  constructor(readonly code: AssignmentUseCaseErrorCode) { super(code); }
}

export type AssignmentListCommand = AssignmentListQuery;
export interface AssignmentDetailCommand { readonly id: string; readonly thirdPartyId: string }
export interface CreateAssignmentCommand {
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly driverId: string;
}
export interface CloseAssignmentCommand {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly expectedVersion: number;
}

/** Safe transport view. Internal subject and audit actors stay inside the application. */
export interface AssignmentView {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly vehiclePlate?: string | null;
  readonly driver: { readonly id: string; readonly name: string };
  readonly status: AssignmentStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly version: number;
}

export interface AssignmentListView {
  readonly items: readonly AssignmentView[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const validId = (value: string) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const sorts = ['startedAt', 'status', 'driverName', 'vehicleId'] as const;

export function validateAssignmentListCommand(input: AssignmentListCommand): void {
  const allowed = ['thirdPartyId', 'subject', 'driverId', 'vehicleId', 'status', 'q', 'page', 'pageSize', 'sort', 'direction'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || !validId(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000
    || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
    || !sorts.includes(input.sort) || (input.direction !== 'asc' && input.direction !== 'desc')
    || (input.status !== undefined && input.status !== 'ACTIVE' && input.status !== 'CLOSED')
    || (input.driverId !== undefined && !validId(input.driverId)) || (input.vehicleId !== undefined && !validId(input.vehicleId))
    || (input.subject !== undefined && (!input.subject || input.subject.length > 128))
    || (input.q !== undefined && (!input.q.trim() || input.q.length > 100))) {
    throw new AssignmentUseCaseError('INVALID_REQUEST');
  }
}

export function validateCreateAssignmentCommand(input: CreateAssignmentCommand): void {
  const allowed = ['thirdPartyId', 'vehicleId', 'driverId'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || !validId(input.thirdPartyId)
    || !validId(input.vehicleId) || !validId(input.driverId)) throw new AssignmentUseCaseError('INVALID_REQUEST');
}

export function validateCloseAssignmentCommand(input: CloseAssignmentCommand): void {
  const allowed = ['id', 'thirdPartyId', 'expectedVersion'];
  if (Object.keys(input).some(key => !allowed.includes(key)) || !validId(input.id) || !validId(input.thirdPartyId)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new AssignmentUseCaseError('INVALID_REQUEST');
}

export function assignmentView(assignment: Assignment): AssignmentView {
  return {
    id: assignment.id,
    thirdPartyId: assignment.thirdPartyId,
    vehicleId: assignment.vehicleId,
    driver: { id: assignment.driverId, name: assignment.driverName },
    status: assignment.status,
    startedAt: assignment.startedAt.toISOString(),
    endedAt: assignment.endedAt?.toISOString() ?? null,
    version: assignment.version,
  };
}

function mapError(error: unknown): AssignmentUseCaseError {
  if (error instanceof AssignmentUseCaseError) return error;
  if (error instanceof AssignmentError) return new AssignmentUseCaseError(error.code === 'ASSIGNMENT_VERSION_CONFLICT' ? error.code : 'INVALID_REQUEST');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  if (code === 'FORBIDDEN') return new AssignmentUseCaseError('FORBIDDEN');
  if (code === 'AUTHORIZATION_UNAVAILABLE') return new AssignmentUseCaseError('AUTHORIZATION_UNAVAILABLE');
  if (code === 'NOT_FOUND' || code === 'RESOURCE_NOT_FOUND') return new AssignmentUseCaseError('RESOURCE_NOT_FOUND');
  if (code === 'ASSIGNMENT_VERSION_CONFLICT' || code === 'ACTIVE_ASSIGNMENT_CONFLICT') return new AssignmentUseCaseError(code);
  if (code === 'DRIVER_NOT_ELIGIBLE' || code === 'VEHICLE_NOT_ELIGIBLE') return new AssignmentUseCaseError(code);
  if (code === 'ASSIGNMENT_AUDIT_UNAVAILABLE') return new AssignmentUseCaseError(code);
  return new AssignmentUseCaseError('ASSIGNMENT_STORAGE_UNAVAILABLE');
}

export function createAssignments(deps: {
  readonly repository: AssignmentRepositoryPort;
  readonly authorization: AssignmentAuthorizationPort;
  readonly drivers: AssignmentDriverEligibility;
  readonly vehicles: AssignmentVehicleEligibility;
  readonly ids: { next(): string };
  readonly clock: { now(): Date };
  readonly correlationId: () => string;
}) {
  async function viewWithVehicle(assignment: Assignment): Promise<AssignmentView> {
    const vehicle = await deps.vehicles.read({ id: assignment.vehicleId, thirdPartyId: assignment.thirdPartyId });
    return { ...assignmentView(assignment), vehiclePlate: vehicle?.plate ?? null };
  }

  async function authorize(actor: AuthenticatedActor, thirdPartyId: string, permission: 'assignments:read' | 'vehicles:assign' | 'vehicles:unassign') {
    if (!validId(thirdPartyId)) throw new AssignmentUseCaseError('INVALID_REQUEST');
    try {
      const receipt = await deps.authorization.authorize({ actor, thirdPartyId, permission });
      return { ...receipt, thirdPartyId, subject: actor.subject };
    } catch (error) { throw mapError(error); }
  }

  function role(receipt: { readonly roles: readonly string[] }, allowed: 'THIRD_PARTY_ADMIN' | 'DRIVER') {
    return receipt.roles.includes(allowed);
  }

  async function readRole(actor: AuthenticatedActor, thirdPartyId: string) {
    const receipt = await authorize(actor, thirdPartyId, 'assignments:read');
    if (role(receipt, 'THIRD_PARTY_ADMIN')) return { receipt, admin: true };
    if (role(receipt, 'DRIVER')) return { receipt, admin: false };
    throw new AssignmentUseCaseError('FORBIDDEN');
  }

  return {
    async list(actor: AuthenticatedActor, input: AssignmentListCommand): Promise<AssignmentListView> {
      validateAssignmentListCommand(input);
      const { admin } = await readRole(actor, input.thirdPartyId);
      const query: AssignmentListQuery = admin ? input : { ...input, subject: actor.subject, status: 'ACTIVE' };
      try {
        const result = await deps.repository.list(query);
        return { items: await Promise.all(result.items.map(viewWithVehicle)), total: result.total, page: input.page, pageSize: input.pageSize };
      } catch (error) { throw mapError(error); }
    },

    async detail(actor: AuthenticatedActor, input: AssignmentDetailCommand): Promise<AssignmentView> {
      if (!validId(input.id) || !validId(input.thirdPartyId)) throw new AssignmentUseCaseError('INVALID_REQUEST');
      const { admin } = await readRole(actor, input.thirdPartyId);
      try {
        const assignment = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId,
          ...(!admin ? { subject: actor.subject, activeOnly: true } : {}) });
        if (!assignment) throw new AssignmentUseCaseError('RESOURCE_NOT_FOUND');
        return viewWithVehicle(assignment);
      } catch (error) { throw mapError(error); }
    },

    async create(actor: AuthenticatedActor, input: CreateAssignmentCommand): Promise<AssignmentView> {
      validateCreateAssignmentCommand(input);
      const authority = await authorize(actor, input.thirdPartyId, 'vehicles:assign');
      if (!role(authority, 'THIRD_PARTY_ADMIN')) throw new AssignmentUseCaseError('FORBIDDEN');
      try {
        const [driver, vehicle] = await Promise.all([
          deps.drivers.read({ id: input.driverId, thirdPartyId: input.thirdPartyId }),
          deps.vehicles.read({ id: input.vehicleId, thirdPartyId: input.thirdPartyId }),
        ]);
        if (!driver || driver.id !== input.driverId || driver.thirdPartyId !== input.thirdPartyId) throw new AssignmentUseCaseError('RESOURCE_NOT_FOUND');
        if (!vehicle || vehicle.id !== input.vehicleId || vehicle.thirdPartyId !== input.thirdPartyId) throw new AssignmentUseCaseError('RESOURCE_NOT_FOUND');
        if (!driver.eligible) throw new AssignmentUseCaseError('DRIVER_NOT_ELIGIBLE');
        if (!vehicle.eligible) throw new AssignmentUseCaseError('VEHICLE_NOT_ELIGIBLE');
        const assignment = createAssignment({ id: deps.ids.next(), thirdPartyId: input.thirdPartyId, vehicleId: vehicle.id,
          driverId: driver.id, subject: driver.subject, driverName: driver.displayName, actor: actor.subject, now: deps.clock.now() });
        const created = await deps.repository.create({ authority, assignment, expectedDriverVersion: driver.version,
          expectedVehicleVersion: vehicle.version, correlationId: deps.correlationId() });
        return { ...assignmentView(created), vehiclePlate: vehicle.plate ?? null };
      } catch (error) { throw mapError(error); }
    },

    async close(actor: AuthenticatedActor, input: CloseAssignmentCommand): Promise<AssignmentView> {
      validateCloseAssignmentCommand(input);
      const authority = await authorize(actor, input.thirdPartyId, 'vehicles:unassign');
      if (!role(authority, 'THIRD_PARTY_ADMIN')) throw new AssignmentUseCaseError('FORBIDDEN');
      try {
        const current = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId });
        if (!current) throw new AssignmentUseCaseError('RESOURCE_NOT_FOUND');
        const transition = closeAssignment({ assignment: current, expectedVersion: input.expectedVersion, actor: actor.subject, now: deps.clock.now() });
        if (!transition.changed) return viewWithVehicle(transition.assignment);
        const closed = await deps.repository.close({ authority, id: input.id, expectedVersion: input.expectedVersion,
          actor: actor.subject, now: deps.clock.now(), correlationId: deps.correlationId() });
        return viewWithVehicle(closed);
      } catch (error) { throw mapError(error); }
    },
  };
}
