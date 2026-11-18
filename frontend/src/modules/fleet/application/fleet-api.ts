import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export type FleetStatus = 'ACTIVE' | 'INACTIVE';
export interface FleetListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'name' | 'identification' | 'plate' | 'status';
  readonly direction: 'asc' | 'desc';
}
export interface FleetPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
export interface DriverDto {
  readonly id: string;
  readonly name: string;
  readonly identification: string;
  readonly status: FleetStatus;
  readonly version: number;
}
export interface VehicleDto {
  readonly id: string;
  readonly plate: string;
  readonly status: FleetStatus;
  readonly currentDriver: { readonly id: string; readonly name: string } | null;
  readonly version: number;
}

/** Presentation ports. Implementations must scope requests to the captured organization. */
export interface FleetApi {
  listDrivers(scope: PermissionScope, query: FleetListQuery, signal: AbortSignal): Promise<FleetPage<DriverDto>>;
  listVehicles(scope: PermissionScope, query: FleetListQuery, signal: AbortSignal): Promise<FleetPage<VehicleDto>>;
  updateDriver(scope: PermissionScope, id: string, version: number, input: { readonly name: string; readonly identification: string }, signal: AbortSignal): Promise<DriverDto>;
  updateVehicle(scope: PermissionScope, id: string, version: number, input: { readonly plate: string }, signal: AbortSignal): Promise<VehicleDto>;
  setDriverStatus(scope: PermissionScope, id: string, version: number, status: FleetStatus, signal: AbortSignal): Promise<DriverDto>;
  setVehicleStatus(scope: PermissionScope, id: string, version: number, status: FleetStatus, signal: AbortSignal): Promise<VehicleDto>;
}
