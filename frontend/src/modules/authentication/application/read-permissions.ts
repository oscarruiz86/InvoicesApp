import type { PermissionScope, PermissionsSnapshot } from '../domain/permissions';
export interface PermissionsPort { read(scope: PermissionScope, signal?: AbortSignal): Promise<PermissionsSnapshot> }
export function createReadPermissions(port: PermissionsPort) {
  return (scope: PermissionScope, signal?: AbortSignal) => port.read(scope, signal);
}
export type ReadPermissions = ReturnType<typeof createReadPermissions>;
