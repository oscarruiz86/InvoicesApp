import type { AuditWriter } from '@/modules/audit/application/audit-ports';
import type { AuditEvent } from '@/modules/audit/domain/audit-event';

export type FleetAuditAction = 'DRIVER_PROVISIONED' | 'DRIVER_MIGRATED' | 'DRIVER_DEACTIVATED' | 'DRIVER_ACTIVATED'
  | 'VEHICLE_CREATED' | 'VEHICLE_UPDATED' | 'VEHICLE_ACTIVATED' | 'VEHICLE_DEACTIVATED' | 'ASSIGNMENT_CREATED' | 'ASSIGNMENT_CLOSED';
export function mapFleetAuditEvent(input: { eventId: string; correlationId: string; at: Date | string; action: FleetAuditAction;
  actorSubject: string; actorKind?: 'user' | 'service' | 'system'; resourceType: 'driver' | 'vehicle' | 'assignment'; resourceId: string;
  thirdPartyId: string; beforeVersion?: number | null; afterVersion: number }): AuditEvent {
  return { eventId: input.eventId, occurredAt: input.at instanceof Date ? input.at.toISOString() : input.at, source: 'fleet',
    actor: { kind: input.actorKind ?? 'user', subject: input.actorSubject }, action: input.action, result: 'allowed', reason: 'BUSINESS_MUTATION',
    correlationId: input.correlationId, scope: { companyId: null, thirdPartyId: input.thirdPartyId },
    resource: { type: input.resourceType, id: input.resourceId },
    ...(input.beforeVersion !== null && input.beforeVersion !== undefined ? { beforeVersion: String(input.beforeVersion) } : {}),
    afterVersion: String(input.afterVersion) };
}

export async function recordFleetAudit(audit: AuditWriter, input: Parameters<typeof mapFleetAuditEvent>[0]): Promise<void> {
  await audit.record(mapFleetAuditEvent(input));
}
