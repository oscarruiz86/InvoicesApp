import type { ErrorCode } from '@/shared/application/application-error';
const messages: Record<ErrorCode, string> = {
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  NOT_FOUND: 'El recurso no está disponible.',
  UNAVAILABLE: 'El servicio no está disponible. Puedes reintentar.',
  CONFIGURATION: 'Revisa la configuración pública de la aplicación.',
  UNAUTHENTICATED: 'La sesión terminó. Vuelve a iniciar sesión.',
  NETWORK: 'No se pudo establecer conexión con la API.',
  TIMEOUT: 'La API tardó demasiado en responder. Puedes volver a intentarlo.',
  CANCELLED: 'La consulta fue cancelada.',
  HTTP: 'La API no está disponible en este momento.',
  INVALID_RESPONSE: 'La API devolvió una respuesta que no se pudo validar.',
  UNEXPECTED: 'Ocurrió un problema inesperado. Puedes volver a intentarlo.',
};
export function errorMessage(code: ErrorCode = 'UNEXPECTED') { return messages[code]; }
