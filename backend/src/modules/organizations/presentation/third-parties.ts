import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { errorResponse } from '@/shared/presentation/http/errors';
import type { ThirdParties } from '../application/third-parties';
import { ThirdPartyError, thirdPartyFields } from '../domain/third-party';

const version = z.string().regex(/^[1-9]\d*$/).max(16);
const id = z.string().regex(/^[a-f0-9]{24}$/);
const profile = z.object(Object.fromEntries(thirdPartyFields.map(key => [key, z.string().max(256).nullable().optional()]))).strict();
const querySchema = z.object({ scope: z.enum(['global', 'organization']), companyId: id.optional(), thirdPartyId: id.optional(), relatedCompanyId: id.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), documentType: z.enum(['NIT', 'CC']).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(), department: z.string().regex(/^\d{2}$/).optional(), city: z.string().regex(/^\d{5}$/).optional(),
  sort: z.enum(['businessName', 'documentNumber', 'createdAt', 'updatedAt', 'status', 'country', 'department', 'city']).default('createdAt'), direction: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine(value => (value.scope === 'global' ? !value.companyId && !value.thirdPartyId : Boolean(value.companyId) !== Boolean(value.thirdPartyId)) && (value.scope === 'global' || !value.relatedCompanyId));

export type ThirdPartyOperation = 'list' | 'create' | 'get' | 'update' | 'status' | 'relationship' | 'relationship-get';
type LocationLabels = { countryLabel: string | null; departmentLabel: string | null; cityLabel: string | null };
type ResolveLocationLabels = (input: { country: string | null; department: string | null; city: string | null }) => Promise<LocationLabels>;
async function withThirdPartyLabels(value: unknown, resolve: ResolveLocationLabels): Promise<unknown> {
  if (!value || typeof value !== 'object') return value;
  const decorate = async (item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const record = item as Record<string, unknown>; const thirdParty = record.thirdParty;
    if (!thirdParty || typeof thirdParty !== 'object') return item;
    const profile = thirdParty as Record<string, unknown>;
    const labels = await resolve({ country: typeof profile.country === 'string' ? profile.country : null,
      department: typeof profile.department === 'string' ? profile.department : null, city: typeof profile.city === 'string' ? profile.city : null });
    return { ...record, thirdParty: { ...profile, countryLabel: labels.countryLabel ?? profile.country, departmentLabel: labels.departmentLabel ?? profile.department, cityLabel: labels.cityLabel ?? profile.city } };
  };
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return { ...record, items: await Promise.all(record.items.map(decorate)) };
  return decorate(value);
}
export function thirdPartyResponse(service: ThirdParties, operation: ThirdPartyOperation, actor: AuthenticatedActor, request: Request, idValue?: string, companyIdValue?: string, resolveLabels?: ResolveLocationLabels) {
  return respond();
  async function respond() {
    try {
      const url = new URL(request.url); const raw: Record<string, string> = {};
      const allowed = ['scope', ...(operation === 'list' ? ['companyId', 'thirdPartyId', 'relatedCompanyId', 'page', 'pageSize', 'q', 'status', 'documentType', 'country', 'department', 'city', 'sort', 'direction']
        : operation === 'relationship' || operation === 'relationship-get' ? ['companyId'] : operation === 'create' ? ['companyId', 'relatedCompanyId'] : ['companyId', 'thirdPartyId'])];
      for (const [key, value] of url.searchParams) { if (key in raw || !allowed.includes(key)) throw new ThirdPartyError('INVALID_REQUEST'); raw[key] = value; }
      const query = querySchema.parse(raw);
      const scope: OrganizationScope = query.scope === 'global' ? { kind: 'global', companyId: null, thirdPartyId: null }
        : { kind: 'organization', companyId: query.companyId ?? null, thirdPartyId: query.thirdPartyId ?? null };
      const access = { actor, scope };
      if (idValue !== undefined) id.parse(idValue);
      if (companyIdValue !== undefined) id.parse(companyIdValue);
      if ((operation === 'relationship' || operation === 'relationship-get') && query.scope === 'organization' && query.companyId !== companyIdValue) throw new ThirdPartyError('INVALID_REQUEST');
      let result: unknown;
      switch (operation) {
        case 'list': result = await service.list(access, query); break;
        case 'get': result = await service.get(access, idValue!); break;
        case 'create': result = await service.create(access, profile.parse(await request.json()), query.relatedCompanyId); break;
        case 'update': {
          const input = z.object({ expectedVersion: version, changes: profile }).strict().parse(await request.json());
          result = await service.update(access, idValue!, input.expectedVersion, input.changes); break;
        }
        case 'status': {
          const input = z.object({ expectedVersion: version, status: z.enum(['ACTIVE', 'INACTIVE']) }).strict().parse(await request.json());
          result = await service.setStatus(access, idValue!, input.expectedVersion, input.status); break;
        }
        case 'relationship': {
          const input = z.object({ expectedVersion: version.nullable(), status: z.enum(['ACTIVE', 'INACTIVE']) }).strict().parse(await request.json());
          result = await service.setRelationship(access, idValue!, companyIdValue!, input.expectedVersion, input.status); break;
        }
        case 'relationship-get': result = await service.getRelationship(access, idValue!, companyIdValue!); break;
      }
      if (resolveLabels) result = await withThirdPartyLabels(result, resolveLabels);
      return Response.json(result, { status: operation === 'create' ? 201 : 200, headers: { 'Cache-Control': 'no-store', ...(operation === 'create' ? { Location: `/api/third-parties/${(result as { thirdParty: { id: string } }).thirdParty.id}` } : {}) } });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) error = new ThirdPartyError('INVALID_REQUEST');
      if (error instanceof Error && error.message === 'IDENTITY_UNAVAILABLE') error = new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
      if (error instanceof ThirdPartyError) {
        const conflicts = ['THIRD_PARTY_DOCUMENT_CONFLICT', 'THIRD_PARTY_VERSION_CONFLICT', 'THIRD_PARTY_INACTIVE', 'RELATIONSHIP_INACTIVE'];
        const status = error.code === 'THIRD_PARTY_STORAGE_UNAVAILABLE' ? 503 : conflicts.includes(error.code) ? 409 : 400;
        return Response.json({ error: { code: error.code, message: status === 409 ? 'El tercero o la relación cambió o los datos entran en conflicto.' : status === 503 ? 'El servicio no está disponible.' : 'Revisa los datos de la solicitud.', ...(error.fields.length ? { fields: error.fields } : {}) } }, { status, headers: { 'Cache-Control': 'no-store' } });
      }
      return errorResponse(error);
    }
  }
}
