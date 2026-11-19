import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { errorResponse } from '@/shared/presentation/http/errors';
import type { ThirdParties } from '../application/third-parties';
import { ThirdPartyError, thirdPartyFields } from '../domain/third-party';

const version = z.string().regex(/^[1-9]\d*$/).max(16);
const id = z.string().regex(/^[a-f0-9]{24}$/);
const profile = z.object(Object.fromEntries(thirdPartyFields.map(key => [key, z.string().max(256).nullable().optional()]))).strict();
const querySchema = z.object({ scope: z.enum(['global', 'organization']), companyId: id.optional(), thirdPartyId: id.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), documentType: z.literal('NIT').optional(),
  country: z.string().trim().min(1).max(128).optional(), department: z.string().trim().min(1).max(128).optional(), city: z.string().trim().min(1).max(128).optional(),
  sort: z.enum(['businessName', 'documentNumber', 'createdAt', 'updatedAt', 'status', 'country', 'department', 'city']).default('createdAt'), direction: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine(value => value.scope === 'global' ? !value.companyId && !value.thirdPartyId : Boolean(value.companyId) !== Boolean(value.thirdPartyId));

export type ThirdPartyOperation = 'list' | 'create' | 'get' | 'update' | 'status' | 'relationship' | 'relationship-get';
export function thirdPartyResponse(service: ThirdParties, operation: ThirdPartyOperation, actor: AuthenticatedActor, request: Request, idValue?: string, companyIdValue?: string) {
  return respond();
  async function respond() {
    try {
      const url = new URL(request.url); const raw: Record<string, string> = {};
      const allowed = ['scope', ...(operation === 'list' ? ['companyId', 'thirdPartyId', 'page', 'pageSize', 'q', 'status', 'documentType', 'country', 'department', 'city', 'sort', 'direction']
        : operation === 'relationship' || operation === 'relationship-get' ? ['companyId'] : operation === 'create' ? ['companyId'] : ['companyId', 'thirdPartyId'])];
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
        case 'create': result = await service.create(access, profile.parse(await request.json())); break;
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
