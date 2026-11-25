import { ConfigurationError } from '@/shared/application/configuration-error';
import { AuthenticationError, AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable, InvalidAuthorizationRequest, PolicyAuditCapacity, PolicyConflict, ResourceNotFound } from '@/modules/identity/application/authorization-errors';

export function errorResponse(error: unknown): Response {
  const authorizationError = error instanceof PolicyAuditCapacity ? [503, 'POLICY_AUDIT_CAPACITY', 'La política no se actualizó porque la capacidad de auditoría está agotada.'] as const
    : error instanceof AuthorizationUnavailable ? [503, 'AUTHORIZATION_UNAVAILABLE', 'La autorización no está disponible.'] as const
    : error instanceof InvalidAuthorizationRequest ? [400, 'INVALID_REQUEST', 'La solicitud no es válida.'] as const
    : error instanceof ResourceNotFound ? [404, 'RESOURCE_NOT_FOUND', 'El recurso no está disponible.'] as const
    : error instanceof PolicyConflict ? [409, 'POLICY_CONFLICT', 'La política cambió o no puede confirmar otra revisión.'] as const : null;
  if (authorizationError) return Response.json({ error: { code: authorizationError[1], message: authorizationError[2] } }, { status: authorizationError[0], headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    const unauthenticated = error instanceof AuthenticationError;
    return Response.json({ error: { code: unauthenticated ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: unauthenticated ? 'Se requiere autenticación válida.' : 'No tiene permisos para realizar esta operación.' } }, {
      status: unauthenticated ? 401 : 403,
      headers: { 'Cache-Control': 'no-store', ...(unauthenticated ? { 'WWW-Authenticate': 'Bearer' } : {}) },
    });
  }
  const configuration = error instanceof ConfigurationError;
  if (configuration) console.error('Variables inválidas:', error.fields.join(', '));
  else console.error('Error interno al procesar una solicitud técnica');
  return Response.json({ error: {
    code: configuration ? 'CONFIGURATION_ERROR' : 'INTERNAL_ERROR',
    message: configuration ? 'El servicio no está configurado correctamente.' : 'No fue posible procesar la solicitud.',
  } }, { status: configuration ? 503 : 500, headers: { 'Cache-Control': 'no-store' } });
}
