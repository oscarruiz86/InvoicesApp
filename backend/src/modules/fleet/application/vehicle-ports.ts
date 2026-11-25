import type { Vehicle, VehicleFields, VehicleStatus } from '../domain/vehicle';
import type { AssignmentConfirmationPort, AssignmentReadEvidence, AssignmentReadPort, AssignmentVehicleSnapshot } from './assignment-ports';
export interface VehicleListQuery {
  readonly thirdPartyId: string; readonly page: number; readonly pageSize: number;
  readonly sort: 'plate' | 'internalNumber' | 'propertyCardNumber' | 'status' | 'createdAt';
  readonly direction: 'asc' | 'desc'; readonly q?: string; readonly status?: VehicleStatus;
  /** Applied together with ACTIVE before counting or pagination. Empty means no access. */
  readonly assignedVehicleIds?: readonly string[];
}
export interface VehicleAuthority { readonly subject: string; readonly thirdPartyId: string; readonly policyVersion: string; readonly contextRevision: string | null }
/** Transaction-bound public port; Organizations confirms active admin membership and all authority fences. */
export interface VehicleAuthorityConfirmation { confirm(authority: VehicleAuthority): Promise<void> }
export interface VehicleMutation {
  readonly authority: VehicleAuthority; readonly correlationId: string;
}
export interface VehicleRepository {
  list(query: VehicleListQuery): Promise<{ items: readonly Vehicle[]; total: number }>;
  find(input: { id: string; thirdPartyId: string; assignedVehicleIds?: readonly string[] }): Promise<Vehicle | null>;
  create(input: VehicleMutation & { fields: VehicleFields }): Promise<Vehicle>;
  update(input: VehicleMutation & { id: string; expectedVersion: number; changes: Partial<VehicleFields> }): Promise<Vehicle>;
  transition(input: VehicleMutation & { id: string; expectedVersion: number; status: VehicleStatus; assignmentRevision?: string }): Promise<Vehicle>;
}
export interface VehicleFactsReader {
  eligibility(input: { id: string; thirdPartyId: string }): Promise<{ vehicleId: string | null; version: number | null; eligible: boolean; plate?: string }>;
}
export type ActiveVehicleAssignment = AssignmentVehicleSnapshot;
export type AssignmentEvidence = AssignmentReadEvidence;
export type AssignmentAccessReader = AssignmentReadPort;
/** Assignment-owned confirmation, called within the Vehicle state-change transaction. */
export type AssignmentConfirmation = Pick<AssignmentConfirmationPort, 'confirmNoOpenForVehicle'>;
export interface VehicleView extends Vehicle {
  readonly currentDrivers: readonly { readonly id: string; readonly name: string }[];
  /** @deprecated Use currentDrivers; retained as a first-driver compatibility field. */
  readonly currentDriver: { readonly id: string; readonly name: string } | null;
  readonly assignmentState: 'UNAVAILABLE' | 'UNASSIGNED' | 'ASSIGNED';
}
