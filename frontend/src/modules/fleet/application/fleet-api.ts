import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export type FleetStatus = 'ACTIVE' | 'INACTIVE';
export interface DriverListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'createdAt' | 'status';
  readonly direction: 'asc' | 'desc';
  readonly status?: FleetStatus;
}
export interface VehicleListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'plate' | 'status';
  readonly direction: 'asc' | 'desc';
}
export interface FleetPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
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
export interface VehicleDto {
  readonly id: string;
  readonly plate: string;
  readonly status: FleetStatus;
  readonly currentDriver: { readonly id: string; readonly name: string } | null;
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
  listVehicles(scope: PermissionScope, query: VehicleListQuery, signal: AbortSignal): Promise<FleetPage<VehicleDto>>;
  updateVehicle(scope: PermissionScope, id: string, version: number, input: { readonly plate: string }, signal: AbortSignal): Promise<VehicleDto>;
  setVehicleStatus(scope: PermissionScope, id: string, version: number, status: FleetStatus, signal: AbortSignal): Promise<VehicleDto>;
}
export interface FleetApi extends DriverApi, VehicleApi {}
