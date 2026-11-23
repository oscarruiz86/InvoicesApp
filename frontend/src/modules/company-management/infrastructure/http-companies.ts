import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { CompanyApi, CompanyTransport } from '../application/company-api';
import { editableFields } from '../domain/company';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
const fields = Object.fromEntries(editableFields.map(key => [key, z.string().nullable()]));
const company = z.object({ ...fields, countryLabel: z.string().nullable().optional(), departmentLabel: z.string().nullable().optional(), cityLabel: z.string().nullable().optional(), id: z.string().regex(/^[a-f0-9]{24}$/), status: z.enum(['ACTIVE', 'INACTIVE']), createdAt: z.string(), updatedAt: z.string(), createdBy: z.string(), updatedBy: z.string().nullable() }).strict();
const record = z.object({ company, version: z.string() }).strict();
const page = { page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() };
export function createCompanyApi(http: CompanyTransport): CompanyApi {
  const query = (scope: PermissionScope, extra: Record<string, string> = {}) => {
    if (scope.kind === 'self' || scope.thirdPartyId || (scope.kind === 'organization' && !scope.companyId)) throw new ApplicationError('FORBIDDEN');
    return new URLSearchParams({ ...extra, scope: scope.kind, ...(scope.companyId ? { companyId: scope.companyId } : {}) }).toString();
  };
  const parse = async <T>(schema: z.ZodType, work: Promise<unknown>): Promise<T> => {
    const result = schema.safeParse(await work);
    if (!result.success) throw new ApplicationError('INVALID_RESPONSE');
    return result.data as T;
  };
  return {
    list: (scope, extra, signal) => parse(z.object({ items: z.array(record), ...page }).strict(), http.company('GET', 'companies', query(scope, extra), undefined, signal)),
    get: (scope, id, signal) => parse(record, http.company('GET', `companies/${id}`, query(scope), undefined, signal)),
    create: (scope, input, signal) => parse(record, http.company('POST', 'companies', query(scope), input, signal)),
    update: (scope, id, expectedVersion, changes, signal) => parse(record, http.company('PATCH', `companies/${id}`, query(scope), { expectedVersion, changes }, signal)),
    status: (scope, id, expectedVersion, status, signal) => parse(record, http.company('POST', `companies/${id}/status`, query(scope), { expectedVersion, status }, signal)),
  };
}
