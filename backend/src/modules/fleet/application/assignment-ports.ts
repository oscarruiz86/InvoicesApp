import type { Assignment, AssignmentStatus } from '../domain/assignment';
import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';

export interface AssignmentAuthority {
  readonly subject: string;
  readonly thirdPartyId: string;
  readonly policyVersion: string;
  readonly contextRevision: string | null;
}

export interface AssignmentPolicyConfirmationPort {
  confirm(expectedVersion: string): Promise<void>;
}

export interface AssignmentAuthorityConfirmationPort {
  confirm(authority: AssignmentAuthority): Promise<void>;
}

export interface AssignmentAuthorizationReceipt {
  readonly roles: readonly ApplicationRole[];
  readonly policyVersion: string;
  readonly contextRevision: string | null;
}

export interface AssignmentAuthorizationPort {
  /** Re-checks the actor, current third-party context and current policy for this permission. */
  authorize(input: {
    readonly actor: AuthenticatedActor;
    readonly thirdPartyId: string;
    readonly permission: 'assignments:read' | 'vehicles:assign' | 'vehicles:unassign';
  }): Promise<AssignmentAuthorizationReceipt>;
}

export interface AssignmentListQuery {
  readonly thirdPartyId: string;
  readonly subject?: string;
  readonly driverId?: string;
  readonly vehicleId?: string;
  readonly status?: AssignmentStatus;
  readonly q?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'startedAt' | 'status' | 'driverName' | 'vehicleId';
  readonly direction: 'asc' | 'desc';
}

export interface AssignmentPage { readonly items: readonly Assignment[]; readonly total: number }

export interface AssignmentVehicleSnapshot {
  readonly vehicleId: string;
  readonly thirdPartyId: string;
  readonly subject: string;
  readonly driverId: string;
  readonly driverName: string;
}

export type AssignmentReadEvidence =
  | { readonly state: 'UNAVAILABLE' }
  | { readonly state: 'CONFIRMED'; readonly revision: string; readonly assignments: readonly AssignmentVehicleSnapshot[] };

export interface AssignmentReadPort {
  read(input: { readonly thirdPartyId: string; readonly subject?: string; readonly vehicleId?: string }): Promise<AssignmentReadEvidence>;
}

export interface AssignmentRepositoryPort {
  list(query: AssignmentListQuery): Promise<AssignmentPage>;
  find(input: { readonly id: string; readonly thirdPartyId: string; readonly subject?: string; readonly activeOnly?: boolean }): Promise<Assignment | null>;
  create(input: { readonly authority: AssignmentAuthority; readonly assignment: Assignment; readonly expectedDriverVersion: number; readonly expectedVehicleVersion: number; readonly correlationId: string }): Promise<Assignment>;
  close(input: { readonly authority: AssignmentAuthority; readonly id: string; readonly expectedVersion: number; readonly actor: string; readonly now: Date; readonly correlationId: string }): Promise<Assignment>;
}

export interface AssignmentDriverFacts {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly subject: string;
  readonly displayName: string;
  readonly version: number;
  readonly eligible: boolean;
}

export interface AssignmentDriverEligibility {
  read(input: { readonly id: string; readonly thirdPartyId: string }): Promise<AssignmentDriverFacts | null>;
}

export interface AssignmentVehicleFacts {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly version: number;
  readonly eligible: boolean;
  readonly plate?: string;
}

export interface AssignmentVehicleEligibility {
  read(input: { readonly id: string; readonly thirdPartyId: string }): Promise<AssignmentVehicleFacts | null>;
}

export interface AssignmentAuditEvent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly action: 'ASSIGNMENT_CREATED' | 'ASSIGNMENT_CLOSED';
  readonly actorSubject: string;
  readonly assignmentId: string;
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly beforeVersion: number | null;
  readonly version: number;
  readonly at: string;
}

/** The repository composes this writer inside its MongoDB transaction. */
export interface AssignmentAuditPort { record(event: AssignmentAuditEvent): Promise<void> }

export type AssignmentPresence =
  | { readonly state: 'CONFIRMED'; readonly revision: string; readonly hasActive: boolean }
  | { readonly state: 'UNAVAILABLE' };

export class AssignmentConfirmationError extends Error {
  constructor(readonly code: 'ACTIVE_ASSIGNMENT_EXISTS' | 'ASSIGNMENT_EVIDENCE_UNAVAILABLE') { super(code); }
}

/** Assignment-owned read and transaction-bound confirmation contract for state transitions. */
export interface AssignmentConfirmationPort {
  readForVehicle(input: { readonly vehicleId: string; readonly thirdPartyId: string }): Promise<AssignmentPresence>;
  readForDriver(input: { readonly driverId: string; readonly thirdPartyId: string }): Promise<AssignmentPresence>;
  confirmNoOpenForVehicle(input: { readonly vehicleId: string; readonly thirdPartyId: string; readonly revision: string }): Promise<void>;
  confirmNoOpenForDriver(input: { readonly driverId: string; readonly thirdPartyId: string; readonly revision: string }): Promise<void>;
}
