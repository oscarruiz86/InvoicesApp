import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ThirdPartyApi, ThirdPartyTransport } from '../application/third-party-api';
import type { ThirdPartyList, ThirdPartyRecord, ThirdPartyRelationship } from '../domain/third-party';

const fields = { documentType: z.enum(['NIT', 'CC']), documentNumber: z.string(), verificationDigit: z.string().nullable(), businessName: z.string(), tradeName: z.string().nullable(), email: z.string().email(), phone: z.string().nullable(), address: z.string().nullable(), country: z.string().nullable(), department: z.string().nullable(), city: z.string().nullable() };
const thirdParty = z.object({ ...fields, countryLabel: z.string().nullable().optional(), departmentLabel: z.string().nullable().optional(), cityLabel: z.string().nullable().optional(), id: z.string().regex(/^[a-f0-9]{24}$/), status: z.enum(['ACTIVE', 'INACTIVE']), createdAt: z.string(), updatedAt: z.string(), createdBy: z.string(), updatedBy: z.string().nullable() }).strict();
const relationship = z.object({ companyId: z.string().regex(/^[a-f0-9]{24}$/), thirdPartyId: z.string().regex(/^[a-f0-9]{24}$/), status: z.enum(['ACTIVE', 'INACTIVE']), version: z.string(), createdAt: z.string().nullable(), updatedAt: z.string(), createdBy: z.string().nullable(), updatedBy: z.string().nullable() }).strict();
const record = z.object({ thirdParty, version: z.string(), relationship: relationship.nullable(), relatedCompanies: z.array(z.object({ id: z.string(), name: z.string() }).strict()).optional() }).strict();
const pageSchema = z.object({ items: z.array(record), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() }).strict();
const relationResult = z.object({ relationship: relationship.nullable() }).strict();

function scopeQuery(scope: PermissionScope, extra: Record<string, string> = {}) {
  if (scope.kind === 'self' || (scope.kind === 'global' && (scope.companyId || scope.thirdPartyId))
    || (scope.kind === 'organization' && Boolean(scope.companyId) === Boolean(scope.thirdPartyId))) throw new ApplicationError('FORBIDDEN');
  return new URLSearchParams({ ...extra, scope: scope.kind, ...(scope.companyId ? { companyId: scope.companyId } : {}), ...(scope.thirdPartyId ? { thirdPartyId: scope.thirdPartyId } : {}) }).toString();
}
const parse = async <T>(schema: z.ZodType<T>, result: Promise<unknown>): Promise<T> => {
  const response = schema.safeParse(await result);
  if (!response.success) throw new ApplicationError('INVALID_RESPONSE');
  return response.data;
};

export function createThirdPartyApi(http: ThirdPartyTransport): ThirdPartyApi {
  const base = (id?: string) => `third-parties${id ? `/${id}` : ''}`;
  return {
    list: (scope, query, signal) => parse(pageSchema, http.thirdParty('GET', base(), scopeQuery(scope, query), undefined, signal)) as Promise<ThirdPartyList>,
    get: (scope, id, signal) => parse(record, http.thirdParty('GET', base(id), scopeQuery(scope), undefined, signal)) as Promise<ThirdPartyRecord>,
    create: (scope, input, signal, relatedCompanyId) => parse(record, http.thirdParty('POST', base(), scopeQuery(scope, relatedCompanyId ? { relatedCompanyId } : {}), input, signal)),
    update: (scope, id, version, changes, signal) => parse(record, http.thirdParty('PATCH', base(id), scopeQuery(scope), { expectedVersion: version, changes }, signal)),
    status: (scope, id, version, status, signal) => parse(record, http.thirdParty('POST', `${base(id)}/status`, scopeQuery(scope), { expectedVersion: version, status }, signal)),
    async getRelationship(scope, id, companyId, signal) {
      const result = await parse(relationResult, http.thirdParty('GET', `${base(id)}/relationships/${companyId}`, scopeQuery(scope), undefined, signal));
      return result.relationship as ThirdPartyRelationship | null;
    },
    relationship: (scope, id, companyId, version, status, signal) => parse(record, http.thirdParty('PUT', `${base(id)}/relationships/${companyId}`, scopeQuery(scope), { expectedVersion: version, status }, signal)),
  };
}
