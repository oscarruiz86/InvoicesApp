import type { AuthorizationClock, SecurityAudit, SecurityEvent } from './authorization-ports';

/** One bounded bucket per process: counts suppression without retaining attacker-controlled keys. */
export function createLimitedSecurityAudit(sink: SecurityAudit, clock: AuthorizationClock, limit = 100, windowMs = 60_000): SecurityAudit {
  let since = clock.now().getTime(); let emitted = 0; let suppressed = 0;
  return { async record(event) {
    const now = clock.now().getTime();
    if (now - since >= windowMs) { since = now; emitted = 0; }
    if (event.action === 'ACCESS_DENIED' && emitted >= limit) { suppressed++; return; }
    const safe: SecurityEvent = { eventId: event.eventId, at: event.at, subject: event.subject, action: event.action,
      result: event.result, reason: event.reason, correlationId: event.correlationId, suppressed,
      ...(event.permission ? { permission: event.permission } : {}),
      ...(event.scope ? { scope: event.scope.kind === 'organization'
        ? { kind: 'organization' as const, companyId: event.scope.companyId, thirdPartyId: event.scope.thirdPartyId }
        : { kind: event.scope.kind, companyId: null, thirdPartyId: null } } : {}),
      ...(event.resource ? { resource: { type: event.resource.type, id: event.resource.id } } : {}),
      ...(event.beforeVersion ? { beforeVersion: event.beforeVersion } : {}), ...(event.afterVersion ? { afterVersion: event.afterVersion } : {}) };
    if (event.action === 'ACCESS_DENIED') emitted++;
    try { await sink.record(safe); suppressed = 0; } catch { suppressed++; }
  } };
}
