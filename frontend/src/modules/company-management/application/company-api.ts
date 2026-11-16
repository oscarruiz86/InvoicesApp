import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { CompanyRecord, CompanyList } from '../domain/company';
export interface CompanyApi {
  list(scope: PermissionScope, query: Record<string, string>, signal: AbortSignal): Promise<CompanyList>;
  get(scope: PermissionScope, id: string, signal: AbortSignal): Promise<CompanyRecord>;
  create(scope: PermissionScope, input: Record<string, unknown>, signal: AbortSignal): Promise<CompanyRecord>;
  update(scope: PermissionScope, id: string, version: string, changes: Record<string, unknown>, signal: AbortSignal): Promise<CompanyRecord>;
  status(scope: PermissionScope, id: string, version: string, status: 'ACTIVE' | 'INACTIVE', signal: AbortSignal): Promise<CompanyRecord>;
}
export interface CompanyTransport { company(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown> }
