import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { errorResponse } from '@/shared/presentation/http/errors';
import type { Companies } from '../application/companies';
import { CompanyError, companyFields } from '../domain/company';
const version = z.string().regex(/^[1-9]\d*$/).max(16);
const id = z.string().regex(/^[a-f0-9]{24}$/);
const profile = z.object(Object.fromEntries(companyFields.map(key => [key, z.string().max(256).nullable().optional()]))).strict();
const querySchema = z.object({ scope: z.enum(['global', 'organization']), companyId: id.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), documentType: z.literal('NIT').optional(),
  country: z.string().trim().min(1).max(128).optional(), department: z.string().trim().min(1).max(128).optional(), city: z.string().trim().min(1).max(128).optional(),
  sort: z.enum(['businessName', 'documentNumber', 'createdAt', 'updatedAt', 'status', 'country', 'department', 'city']).default('createdAt'), direction: z.enum(['asc', 'desc']).default('desc'), active: z.enum(['true', 'false']).optional(),
}).strict().refine(value => value.scope === 'global' ? !value.companyId : Boolean(value.companyId));
export type CompanyOperation = 'list' | 'create' | 'get' | 'update' | 'status' | 'administrators';
export function companyResponse(service: Companies, operation: CompanyOperation, actor: AuthenticatedActor, request: Request, companyId?: string) {
  return respond();
  async function respond() {
    try {
      const url = new URL(request.url); const raw: Record<string, string> = {};
      const allowed = ['scope', 'companyId', ...(operation === 'list' ? ['page', 'pageSize', 'q', 'status', 'documentType', 'country', 'department', 'city', 'sort', 'direction'] : operation === 'administrators' ? ['page', 'pageSize', 'active'] : [])];
      for (const [key, value] of url.searchParams) { if (key in raw || !allowed.includes(key)) throw new CompanyError('INVALID_REQUEST'); raw[key] = value; }
      const query = querySchema.parse(raw);
      const scope: OrganizationScope = query.scope === 'global' ? { kind: 'global', companyId: null, thirdPartyId: null } : { kind: 'organization', companyId: query.companyId!, thirdPartyId: null };
      const access = { actor, scope };
      if (companyId !== undefined) id.parse(companyId);
      let result: unknown;
      switch (operation) {
        case 'list': result = await service.list(access, query); break;
        case 'get': result = await service.get(access, companyId!); break;
        case 'administrators': result = await service.administrators(access, companyId!, query.page, query.pageSize, query.active === undefined ? undefined : query.active === 'true'); break;
        case 'create': result = await service.create(access, profile.parse(await request.json())); break;
        case 'update': {
          const input = z.object({ expectedVersion: version, changes: profile }).strict().parse(await request.json());
          result = await service.update(access, companyId!, input.expectedVersion, input.changes); break;
        }
        case 'status': {
          const input = z.object({ expectedVersion: version, status: z.enum(['ACTIVE', 'INACTIVE']) }).strict().parse(await request.json());
          result = await service.setStatus(access, companyId!, input.expectedVersion, input.status); break;
        }
      }
      return Response.json(result, { status: operation === 'create' ? 201 : 200, headers: { 'Cache-Control': 'no-store', ...(operation === 'create' ? { Location: `/api/companies/${(result as { company: { id: string } }).company.id}` } : {}) } });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) error = new CompanyError('INVALID_REQUEST');
      if (error instanceof Error && error.message === 'IDENTITY_UNAVAILABLE') error = new CompanyError('IDENTITY_UNAVAILABLE');
      if (error instanceof CompanyError) {
        const status = error.code.endsWith('UNAVAILABLE') ? 503 : ['COMPANY_DOCUMENT_CONFLICT', 'COMPANY_VERSION_CONFLICT', 'COMPANY_INACTIVE'].includes(error.code) ? 409 : 400;
        return Response.json({ error: { code: error.code, message: status === 409 ? 'La empresa cambió o los datos entran en conflicto.' : status === 503 ? 'El servicio no está disponible.' : 'Revisa los datos de la solicitud.', ...(error.fields.length ? { fields: error.fields } : {}) } }, { status, headers: { 'Cache-Control': 'no-store' } });
      }
      return errorResponse(error);
    }
  }
}

export function retiredCompanyAssociationResponse() {
  return Response.json({ error: { code: 'INVITATION_FLOW_REQUIRED', message: 'La asociación directa fue retirada. Use el flujo de invitaciones.' } },
    { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
