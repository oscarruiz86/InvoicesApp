import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { MembershipUseCaseError } from '../application/memberships';
import type { Membership } from '../domain/invitations';
import type { OrganizationType } from '../domain/organization';

const id = z.string().trim().min(1).max(128).regex(/\S/);
const organizationType = z.enum(['COMPANY', 'THIRD_PARTY']);
const membershipStatus = z.enum(['ACTIVE', 'INACTIVE']);
const role = z.enum(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']);
const pageQuery = z.object({ organizationId: id, organizationType, companyId: id.nullable().default(null), status: membershipStatus.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const scopeQuery = z.object({ organizationId: id, organizationType, companyId: id.nullable().default(null) }).strict();
const rolesBody = z.object({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), organizationId: id, organizationType,
  companyId: id.nullable().default(null), roles: z.array(role).min(1).max(3) }).strict();
const statusBody = z.object({ expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), organizationId: id, organizationType,
  companyId: id.nullable().default(null), status: membershipStatus }).strict();

export type MembershipOperation = 'list' | 'profile' | 'roles' | 'status';
type MembershipService = ReturnType<typeof import('../application/memberships').createMemberships>;

export async function membershipResponse(service: MembershipService, operation: MembershipOperation, actor: AuthenticatedActor, request: Request, membershipId?: string) {
  try {
    let result: unknown;
    if (operation === 'list') {
      const params = new URL(request.url).searchParams; const raw: Record<string, string> = {};
      for (const [key, value] of params) { if (key in raw) throw new MembershipUseCaseError('INVALID_REQUEST'); raw[key] = value; }
      result = await service.list(actor, pageQuery.parse(raw));
    } else if (operation === 'profile') {
      const params = new URL(request.url).searchParams; const raw: Record<string, string> = {};
      for (const [key, value] of params) { if (key in raw) throw new MembershipUseCaseError('INVALID_REQUEST'); raw[key] = value; }
      result = await service.profile(actor, { membershipId: id.parse(membershipId), ...scopeQuery.parse(raw) });
    } else if (operation === 'roles') {
      result = await service.change(actor, { membershipId: id.parse(membershipId), ...rolesBody.parse(await request.json()) });
    } else {
      result = await service.change(actor, { membershipId: id.parse(membershipId), ...statusBody.parse(await request.json()) });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) error = new MembershipUseCaseError('INVALID_REQUEST');
    if (error instanceof MembershipUseCaseError) {
      const values: Record<MembershipUseCaseError['code'], readonly [number, string]> = {
        INVALID_REQUEST: [400, 'La solicitud no es válida.'], NOT_FOUND: [404, 'La pertenencia no está disponible.'],
        FORBIDDEN: [403, 'No tiene permisos para esta operación.'], CONFLICT: [409, 'La pertenencia cambió; vuelve a consultar los datos.'],
        UNAVAILABLE: [503, 'El servicio no está disponible.'],
      };
      const [status, message] = values[error.code];
      return Response.json({ error: { code: error.code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      const mappings: Record<string, readonly [number, string, string]> = {
        INVALID_RECORD: [400, 'INVALID_REQUEST', 'La solicitud no es válida.'], INVALID_ROLES: [400, 'INVALID_ROLES', 'Los roles solicitados no son válidos.'],
        LAST_ROLE_REQUIRED: [400, 'LAST_ROLE_REQUIRED', 'La pertenencia debe conservar al menos un rol.'],
        LAST_ADMINISTRATOR_REQUIRED: [409, 'LAST_ADMINISTRATOR_REQUIRED', 'La organización debe conservar un administrador.'],
        VERSION_CONFLICT: [409, 'VERSION_CONFLICT', 'La pertenencia cambió; vuelve a consultar los datos.'],
        AUTHORITY_REVOKED: [403, 'FORBIDDEN', 'No tiene permisos para esta operación.'], RECORD_NOT_FOUND: [404, 'NOT_FOUND', 'La pertenencia no está disponible.'],
        STORAGE_UNAVAILABLE: [503, 'UNAVAILABLE', 'El servicio no está disponible.'], DUPLICATE_MEMBERSHIP: [409, 'MEMBERSHIP_EXISTS', 'El usuario ya pertenece a esta organización.'],
      };
      const mapping = mappings[error.code];
      if (mapping) return Response.json({ error: { code: mapping[1], message: mapping[2] } }, { status: mapping[0], headers: { 'Cache-Control': 'no-store' } });
    }
    return errorResponse(error);
  }
}

export function membershipStatusQuery(value: string | null): Membership['status'] | undefined {
  if (!value) return undefined;
  return membershipStatus.parse(value);
}

export function membershipOrganizationType(value: string): OrganizationType { return organizationType.parse(value); }
