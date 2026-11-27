import type { Connection } from 'mongoose';
import type { AuditHistoryFilters, AuditHistoryPosition, AuditHistoryReader } from '../../application/audit-history';
import { normalizeAuditEvent } from '../../domain/audit-event';
import { auditModel } from '@/shared/infrastructure/mongodb/audit-writer';

function eventFromDocument(value: Record<string, unknown>) {
  return normalizeAuditEvent({ eventId: String(value._id), occurredAt: new Date(value.occurredAt as Date).toISOString(), source: value.source,
    actor: value.actor, action: value.action, ...(value.captureOrigin ? { captureOrigin: value.captureOrigin } : {}),
    ...(value.changedFields ? { changedFields: value.changedFields } : {}), result: value.result, reason: value.reason, correlationId: value.correlationId,
    ...(value.scope ? { scope: value.scope } : {}), ...(value.resource ? { resource: value.resource } : {}),
    ...(value.beforeVersion ? { beforeVersion: value.beforeVersion } : {}), ...(value.afterVersion ? { afterVersion: value.afterVersion } : {}),
    ...(value.suppressed !== undefined ? { suppressed: value.suppressed } : {}) });
}
export function createMongoAuditHistoryReader(connection: Connection): AuditHistoryReader {
  const model = auditModel(connection);
  return {
    async list(input: AuditHistoryFilters & { snapshotAt: string; after?: AuditHistoryPosition; excludeReadAt?: string; limit: number }) {
      const occurredAt: Record<string, Date> = { $lte: new Date(input.snapshotAt) };
      if (input.from) occurredAt.$gte = new Date(input.from);
      if (input.to) occurredAt.$lte = new Date(input.to) < occurredAt.$lte ? new Date(input.to) : occurredAt.$lte;
      const filter: Record<string, unknown> = { occurredAt, expiresAt: { $gt: new Date() } };
      if (input.source) filter.source = input.source;
      if (input.action) filter.action = input.action;
      if (input.result) filter.result = input.result;
      if (input.actorSubjects) filter['actor.subject'] = { $in: input.actorSubjects };
      if (input.excludeReadAt) filter.$nor = [{ source: 'audit', action: 'AUDIT_HISTORY_READ', occurredAt: new Date(input.excludeReadAt) }];
      if (input.after) filter.$or = [{ occurredAt: { $lt: new Date(input.after.occurredAt) } }, { occurredAt: new Date(input.after.occurredAt), _id: { $lt: input.after.eventId } }];
      const rows = await model.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(input.limit).lean().exec();
      return rows.map(value => eventFromDocument(value as unknown as Record<string, unknown>));
    },
    async find(eventId: string) {
      const value = await model.findOne({ _id: eventId, expiresAt: { $gt: new Date() } }).lean().exec();
      return value ? eventFromDocument(value as unknown as Record<string, unknown>) : null;
    },
  };
}
