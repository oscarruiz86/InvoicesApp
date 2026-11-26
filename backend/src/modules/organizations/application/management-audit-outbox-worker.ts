import type { AuditEvent } from '@/modules/audit/domain/audit-event';

export type ManagementCapture = Readonly<{
  eventId: string; correlationId?: string; at: Date | string; subject?: string; action: string;
  actorSubject?: string | null; invitationId?: string; organizationId?: string; version?: number;
  companyId?: string | null; thirdPartyId?: string; scope?: { kind: string; companyId: string | null; thirdPartyId: string | null };
  beforeVersion?: string | number | null; afterVersion?: string | number;
}>;
export type ManagementCaptureSource = 'company_management_events' | 'third_party_management_events' | 'organization_invitation_events';
export interface ManagementAuditOutbox {
  pending(limit: number): Promise<readonly { source: ManagementCaptureSource; capture: ManagementCapture }[]>;
  acknowledge(source: ManagementCaptureSource, eventId: string): Promise<void>;
}

const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_:@-]{1,128}$/u.test(value);
function mapCapture(source: ManagementCaptureSource, capture: ManagementCapture): AuditEvent {
  if (source === 'organization_invitation_events') {
    const invitationScope = capture.scope;
    const actorSubject = capture.actorSubject ?? capture.subject;
    if (actorSubject !== null && actorSubject !== undefined && !opaque(actorSubject)) throw new Error('ORGANIZATION_AUDIT_CAPTURE_INVALID');
    const actor = actorSubject && opaque(actorSubject)
      ? { kind: 'user' as const, subject: actorSubject }
      : { kind: 'system' as const, subject: 'invitation-lifecycle-worker' };
    const time = capture.at instanceof Date ? capture.at.toISOString() : capture.at;
    if (!opaque(capture.eventId) || !opaque(capture.invitationId) || !opaque(capture.organizationId)
      || typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(time)
      || !invitationScope || invitationScope.kind !== 'organization'
      || invitationScope.companyId !== null && !opaque(invitationScope.companyId)
      || invitationScope.thirdPartyId !== null && !opaque(invitationScope.thirdPartyId)) throw new Error('ORGANIZATION_AUDIT_CAPTURE_INVALID');
    return { eventId: capture.eventId, occurredAt: time, source: 'organizations', actor, action: capture.action, result: 'allowed',
      reason: 'INVITATION_LIFECYCLE', correlationId: capture.eventId, scope: { companyId: invitationScope.companyId, thirdPartyId: invitationScope.thirdPartyId },
      resource: { type: 'invitation', id: capture.invitationId }, ...(capture.version !== undefined ? { afterVersion: String(capture.version) } : {}) };
  }
  const companyEvent = source === 'company_management_events';
  const resourceId = companyEvent ? capture.companyId : capture.thirdPartyId;
  const time = capture.at instanceof Date ? capture.at.toISOString() : capture.at;
  if (!opaque(capture.eventId) || !opaque(capture.correlationId) || !opaque(capture.subject) || !opaque(resourceId)
    || typeof time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(time)
    || !capture.scope || !['global', 'organization', 'self'].includes(capture.scope.kind)
    || capture.scope.companyId !== null && !opaque(capture.scope.companyId)
    || capture.scope.thirdPartyId !== null && !opaque(capture.scope.thirdPartyId)) throw new Error('ORGANIZATION_AUDIT_CAPTURE_INVALID');
  const scope = companyEvent
    ? { companyId: capture.companyId!, thirdPartyId: null }
    : { companyId: capture.scope.companyId, thirdPartyId: capture.thirdPartyId! };
  return {
    eventId: capture.eventId, occurredAt: time, source: 'organizations', actor: { kind: 'user', subject: capture.subject },
    action: capture.action, result: 'allowed', reason: 'BUSINESS_MUTATION', correlationId: capture.correlationId,
    scope, resource: { type: companyEvent ? 'company' : 'third-party', id: resourceId },
    ...(capture.beforeVersion !== null && capture.beforeVersion !== undefined ? { beforeVersion: String(capture.beforeVersion) } : {}),
    ...(capture.afterVersion !== undefined ? { afterVersion: String(capture.afterVersion) } : {}),
  };
}

export function createManagementAuditOutboxWorker(input: { outbox: ManagementAuditOutbox; audit: { record(event: AuditEvent): Promise<void> }; batchSize?: number }) {
  const batchSize = input.batchSize ?? 50;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 250) throw new Error('ORGANIZATION_AUDIT_BATCH_SIZE_INVALID');
  return { async deliverBatch(): Promise<number> {
    const captures = await input.outbox.pending(batchSize);
    let delivered = 0;
    for (const { source, capture } of captures) {
      const event = mapCapture(source, capture);
      await input.audit.record(event);
      await input.outbox.acknowledge(source, event.eventId);
      delivered++;
    }
    return delivered;
  } };
}
