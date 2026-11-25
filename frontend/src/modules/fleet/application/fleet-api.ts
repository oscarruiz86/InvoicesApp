import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export type FleetStatus = 'ACTIVE' | 'INACTIVE';
export interface DriverListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'createdAt' | 'status';
  readonly direction: 'asc' | 'desc';
  readonly status?: FleetStatus;
  readonly q?: string;
}
export interface VehicleListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'plate' | 'internalNumber' | 'propertyCardNumber' | 'status' | 'createdAt';
  readonly q?: string;
  readonly status?: FleetStatus;
  readonly direction: 'asc' | 'desc';
}
export interface FleetPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
export type AssignmentStatus = 'ACTIVE' | 'CLOSED';
export interface AssignmentDto {
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
export interface AssignmentListQuery {
  readonly page: number; readonly pageSize: number; readonly sort: 'startedAt' | 'status' | 'driverName' | 'vehicleId';
  readonly direction: 'asc' | 'desc'; readonly status?: AssignmentStatus; readonly driverId?: string; readonly vehicleId?: string; readonly q?: string;
}
export interface AssignmentApi {
  listAssignments(scope: PermissionScope, query: AssignmentListQuery, signal: AbortSignal): Promise<FleetPage<AssignmentDto>>;
  getAssignment(scope: PermissionScope, id: string, signal: AbortSignal): Promise<AssignmentDto>;
  createAssignment(scope: PermissionScope, input: { vehicleId: string; driverId: string }, signal: AbortSignal): Promise<AssignmentDto>;
  closeAssignment(scope: PermissionScope, id: string, version: number, signal: AbortSignal): Promise<AssignmentDto>;
}
export interface DriverDto {
  readonly driver: {
    readonly id: string;
    readonly thirdPartyId: string;
    readonly status: FleetStatus;
    readonly version: number;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly identity: {
    readonly name: string;
    readonly documentType?: string | null;
    readonly documentNumber: string | null;
    readonly email: string | null;
  } | null;
}
export interface VehicleFields { readonly plate: string; readonly internalNumber: string; readonly propertyCardNumber: string }
export interface VehicleDto extends VehicleFields {
  readonly thirdPartyId: string;
  readonly createdAt: string; readonly updatedAt: string; readonly createdBy: string; readonly updatedBy: string;
  readonly assignmentState: 'UNAVAILABLE' | 'UNASSIGNED' | 'ASSIGNED';
  readonly id: string;
  readonly plate: string;
  readonly status: FleetStatus;
  readonly currentDriver: { readonly id: string; readonly name: string } | null;
  readonly currentDrivers: readonly { readonly id: string; readonly name: string }[];
  readonly version: number;
}

/** Protected HTTP port for driver reads and versioned status transitions. */
export interface DriverApi {
  listDrivers(scope: PermissionScope, query: DriverListQuery, signal: AbortSignal): Promise<FleetPage<DriverDto>>;
  getDriver(scope: PermissionScope, id: string, signal: AbortSignal): Promise<DriverDto>;
  setDriverStatus(scope: PermissionScope, id: string, version: number, status: FleetStatus, signal: AbortSignal): Promise<DriverDto>;
}

/** Existing vehicle operations stay in their own contract. */
export interface VehicleApi {
  createVehicle(scope: PermissionScope, fields: VehicleFields, signal: AbortSignal): Promise<VehicleDto>;
  getVehicle(scope: PermissionScope, id: string, signal: AbortSignal): Promise<VehicleDto>;
  listVehicles(scope: PermissionScope, query: VehicleListQuery, signal: AbortSignal): Promise<FleetPage<VehicleDto>>;
  updateVehicle(scope: PermissionScope, id: string, version: number, input: Partial<VehicleFields>, signal: AbortSignal): Promise<VehicleDto>;
  setVehicleStatus(scope: PermissionScope, id: string, version: number, status: FleetStatus, signal: AbortSignal): Promise<VehicleDto>;
}
export interface FleetApi extends DriverApi, VehicleApi {}
