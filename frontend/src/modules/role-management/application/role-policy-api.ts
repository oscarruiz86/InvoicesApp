import type { RoleGrant, RolePolicyPort, RolePolicyResponse } from '../domain/role-policy';

export interface RolePolicyHttp {
  roles(method: 'GET' | 'PUT', query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
}

export function createRolePolicyApi(port: RolePolicyPort) {
  return {
    read(signal?: AbortSignal): Promise<RolePolicyResponse> {
      return port.read(signal);
    },
    replace(expectedVersion: string, grants: readonly RoleGrant[], signal?: AbortSignal): Promise<RolePolicyResponse> {
      return port.replace(expectedVersion, grants, signal);
    },
  };
}
export type RolePolicyApi = ReturnType<typeof createRolePolicyApi>;
