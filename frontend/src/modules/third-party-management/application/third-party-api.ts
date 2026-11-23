import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ThirdPartyList, ThirdPartyRecord, ThirdPartyRelationship } from '../domain/third-party';

export interface ThirdPartyApi {
  list(scope: PermissionScope, query: Record<string, string>, signal: AbortSignal): Promise<ThirdPartyList>;
  get(scope: PermissionScope, id: string, signal: AbortSignal): Promise<ThirdPartyRecord>;
  create(scope: PermissionScope, input: Record<string, unknown>, signal: AbortSignal, relatedCompanyId?: string): Promise<ThirdPartyRecord>;
  update(scope: PermissionScope, id: string, version: string, changes: Record<string, unknown>, signal: AbortSignal): Promise<ThirdPartyRecord>;
  status(scope: PermissionScope, id: string, version: string, status: 'ACTIVE' | 'INACTIVE', signal: AbortSignal): Promise<ThirdPartyRecord>;
  getRelationship(scope: PermissionScope, id: string, companyId: string, signal: AbortSignal): Promise<ThirdPartyRelationship | null>;
  relationship(scope: PermissionScope, id: string, companyId: string, version: string | null, status: 'ACTIVE' | 'INACTIVE', signal: AbortSignal): Promise<ThirdPartyRecord>;
}
export interface ThirdPartyTransport {
  thirdParty(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
}
