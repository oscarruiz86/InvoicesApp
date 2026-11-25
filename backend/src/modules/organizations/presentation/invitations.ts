import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { errorResponse } from '@/shared/presentation/http/errors';
import { InvitationUseCaseError, type InvitationView } from '../application/invitations';
import type { InvitationStatus } from '../domain/invitations';

const id = z.string().trim().min(1).max(128).regex(/\S/);
const email = z.string().trim().min(3).max(254).email();
const role = z.enum(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']);
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const organizationType = z.enum(['COMPANY', 'THIRD_PARTY']);
const listOrganizationType = z.enum(['COMPANY', 'THIRD_PARTY', 'ALL']);
const status = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED']);
const delivery = z.enum(['UNKNOWN', 'LOGGED', 'FAILED']);
const createBody = z.object({ organizationId: id, organizationType, companyId: id.nullable(), recipientEmail: email, roles: z.array(role).min(1).max(3) }).strict();
const tokenBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expectedVersion: version }).strict();
const expectedVersionBody = z.object({ expectedVersion: version }).strict();
const listQuery = z.object({ organizationId: id, organizationType: listOrganizationType, companyId: id.nullable().default(null), status: status.optional(),
  email: z.string().trim().max(254).optional(), role: role.optional(), delivery: delivery.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const receivedQuery = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const listResponse = z.object({ items: z.array(z.unknown()), page: z.number(), pageSize: z.number(), total: z.number() }).strict();

export type InvitationOperation = 'list' | 'received' | 'create' | 'get' | 'preview' | 'accept' | 'reject' | 'acceptReceived' | 'rejectReceived' | 'cancel' | 'resend';

export async function invitationResponse(service: ReturnType<typeof import('../application/invitations').createInvitations>, operation: InvitationOperation, actor: AuthenticatedActor | null, request: Request, invitationId?: string) {
  try {
    let result: unknown;
    if (operation === 'preview') {
      const input = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await request.json());
      result = await service.preview(input.token);
    } else if (operation === 'list') {
      const params = new URL(request.url).searchParams;
      const raw: Record<string, string> = {};
      for (const [key, value] of params) { if (key in raw) throw new InvitationUseCaseError('INVALID_REQUEST'); raw[key] = value; }
      const input = listQuery.parse(raw);
      result = await service.list(actor!, input);
      listResponse.parse(result);
    } else if (operation === 'received') {
      const params = new URL(request.url).searchParams;
      const raw: Record<string, string> = {};
      for (const [key, value] of params) { if (key in raw) throw new InvitationUseCaseError('INVALID_REQUEST'); raw[key] = value; }
      const input = receivedQuery.parse(raw);
      result = await service.received(actor!, input);
      listResponse.parse(result);
    } else if (operation === 'create') {
      result = await service.create(actor!, createBody.parse(await request.json()));
    } else if (operation === 'get') {
      result = await service.get(actor!, id.parse(invitationId));
    } else if (operation === 'cancel' || operation === 'resend') {
      const input = expectedVersionBody.parse(await request.json());
      result = operation === 'cancel' ? await service.cancel(actor!, id.parse(invitationId), input.expectedVersion) : await service.resend(actor!, id.parse(invitationId), input.expectedVersion);
    } else if (operation === 'acceptReceived' || operation === 'rejectReceived') {
      const input = expectedVersionBody.parse(await request.json());
      result = operation === 'acceptReceived' ? await service.acceptReceived(actor!, id.parse(invitationId), input.expectedVersion)
        : await service.rejectReceived(actor!, id.parse(invitationId), input.expectedVersion);
    } else {
      const input = tokenBody.parse(await request.json());
      result = operation === 'accept' ? await service.accept(actor!, input.token, input.expectedVersion) : await service.reject(actor!, input.token, input.expectedVersion);
    }
    const statusCode = operation === 'create' ? 201 : 200;
    const location = operation === 'create' ? `/api/invitations/${(result as InvitationView).id}` : undefined;
    return Response.json(result, { status: statusCode, headers: { 'Cache-Control': 'no-store', ...(location ? { Location: location } : {}) } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) error = new InvitationUseCaseError('INVALID_REQUEST');
    if (error instanceof InvitationUseCaseError) {
      const details: Record<InvitationUseCaseError['code'], readonly [number, string]> = {
        INVALID_REQUEST: [400, 'La solicitud no es válida.'], NOT_FOUND: [404, 'La invitación no está disponible.'],
        EXPIRED: [410, 'La invitación venció.'], CONFLICT: [409, 'La invitación cambió o ya fue resuelta.'],
        FORBIDDEN: [403, 'No tiene permisos para esta operación.'], UNAVAILABLE: [503, 'El servicio no está disponible.'],
        IDENTITY_MISMATCH: [403, 'Usa la cuenta destinataria de la invitación.'],
        EMAIL_UNVERIFIED: [403, 'Verifica tu correo antes de resolver la invitación.'],
        PROFILE_INCOMPLETE: [403, 'Completa tu nombre y documento en Keycloak.'],
      };
      const [statusCode, message] = details[error.code];
      return Response.json({ error: { code: error.code, message } }, { status: statusCode, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      const mapped: Record<string, readonly [number, string, string]> = {
        INVALID_RECORD: [400, 'INVALID_REQUEST', 'La solicitud no es válida.'], INVALID_ROLES: [400, 'INVALID_ROLES', 'Los roles solicitados no son válidos.'],
        LAST_ROLE_REQUIRED: [400, 'LAST_ROLE_REQUIRED', 'La pertenencia debe conservar al menos un rol.'],
        DUPLICATE_PENDING_INVITATION: [409, 'INVITATION_EXISTS', 'Ya existe una invitación activa para este destinatario.'],
        DUPLICATE_MEMBERSHIP: [409, 'MEMBERSHIP_EXISTS', 'El usuario ya pertenece a esta organización.'],
        VERSION_CONFLICT: [409, 'VERSION_CONFLICT', 'La invitación cambió o ya fue resuelta.'],
        LAST_ADMINISTRATOR_REQUIRED: [409, 'LAST_ADMINISTRATOR_REQUIRED', 'La organización debe conservar un administrador.'],
        INVITATION_EXPIRED: [410, 'INVITATION_EXPIRED', 'La invitación venció.'], RECORD_NOT_FOUND: [404, 'NOT_FOUND', 'La invitación no está disponible.'],
        AUTHORITY_REVOKED: [403, 'FORBIDDEN', 'No tiene permisos para esta operación.'], IDENTITY_MISMATCH: [403, 'IDENTITY_MISMATCH', 'Usa la cuenta destinataria de la invitación.'],
        STORAGE_UNAVAILABLE: [503, 'UNAVAILABLE', 'El servicio no está disponible.'],
      };
      const response = mapped[error.code];
      if (response) return Response.json({ error: { code: response[1], message: response[2] } }, { status: response[0], headers: { 'Cache-Control': 'no-store' } });
    }
    return errorResponse(error);
  }
}

export function invitationStatusQuery(value: string | null): InvitationStatus | undefined {
  if (!value) return undefined;
  return status.parse(value);
}
