import type { SecurityEvent } from '../application/authorization-ports';
import type { AuditEvent } from '@/modules/audit/domain/audit-event';

export function authorizationAuditEvent(event: SecurityEvent): AuditEvent {
  const scope = event.scope?.kind === 'organization'
    ? { companyId: event.scope.companyId, thirdPartyId: event.scope.thirdPartyId } : undefined;
  return {
    eventId: event.eventId, occurredAt: event.at, source: 'authorization', actor: { kind: 'user', subject: event.subject },
    action: event.action, result: event.result, reason: event.reason, correlationId: event.correlationId, suppressed: event.suppressed,
    ...(scope ? { scope } : {}), ...(event.resource ? { resource: event.resource } : {}),
    ...(event.beforeVersion ? { beforeVersion: event.beforeVersion } : {}), ...(event.afterVersion ? { afterVersion: event.afterVersion } : {}),
  };
}
