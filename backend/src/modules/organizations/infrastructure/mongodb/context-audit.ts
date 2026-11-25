import type { Connection } from 'mongoose';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import type { ContextAudit } from '../../application/context-ports';

export function createContextAudit(connect: () => Promise<Connection>): ContextAudit {
  return { async record(event) {
    const selection = event.result === 'allowed' ? event.selection : undefined;
    await createMongoAuditWriter(await connect()).record({
      eventId: event.eventId, occurredAt: event.at, source: 'organizations', actor: { kind: 'user', subject: event.subject },
      action: event.action, result: event.result, reason: 'CONTEXT', correlationId: event.correlationId, suppressed: event.suppressed,
      ...(selection?.kind === 'ORGANIZATION' ? { scope: { companyId: selection.organizationType === 'COMPANY' ? selection.organizationId : null,
        thirdPartyId: selection.organizationType === 'THIRD_PARTY' ? selection.organizationId : null } } : {}),
    });
  } };
}
