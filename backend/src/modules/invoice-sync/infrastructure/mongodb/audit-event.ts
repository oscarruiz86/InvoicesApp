import type { AuditEvent } from '@/modules/audit/domain/audit-event';

export type OfflineResolutionAction = 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT';
const actions: Readonly<Record<OfflineResolutionAction, string>> = {
  LINK_DUPLICATE: 'SUBMISSION_LINKED_DUPLICATE',
  APPROVE_CLOSED_ASSIGNMENT: 'SUBMISSION_CLOSED_ASSIGNMENT_APPROVED',
  REJECT: 'SUBMISSION_REJECTED',
};

export function offlineResolutionAuditEvent(input: { eventId: string; at: Date | string; actorSubject: string; action: OfflineResolutionAction;
  submissionId: string; thirdPartyId: string; beforeVersion: number; afterVersion: number }): AuditEvent {
  return { eventId: input.eventId, occurredAt: input.at instanceof Date ? input.at.toISOString() : input.at, source: 'invoice-sync',
    actor: { kind: 'user', subject: input.actorSubject }, action: actions[input.action], result: 'allowed', reason: 'OFFLINE_RESOLUTION',
    correlationId: input.eventId, scope: { companyId: null, thirdPartyId: input.thirdPartyId },
    resource: { type: 'invoice-submission', id: input.submissionId }, beforeVersion: String(input.beforeVersion), afterVersion: String(input.afterVersion) };
}
