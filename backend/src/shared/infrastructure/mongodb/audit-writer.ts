import { Schema, type ClientSession, type Connection } from 'mongoose';
import { auditExpiresAt, normalizeAuditEvent } from '@/modules/audit/domain/audit-event';
import { AuditEventConflict, AuditUnavailable, type AuditWriter } from '@/modules/audit/application/audit-ports';

const scopeSchema = new Schema({ companyId: { type: String, default: null, maxlength: 128 }, thirdPartyId: { type: String, default: null, maxlength: 128 } }, { _id: false, strict: 'throw' });
const resourceSchema = new Schema({ type: { type: String, required: true, maxlength: 64 }, id: { type: String, default: null, maxlength: 128 } }, { _id: false, strict: 'throw' });
const eventSchema = new Schema({
  _id: { type: String, required: true, maxlength: 128 }, occurredAt: { type: Date, required: true }, expiresAt: { type: Date, required: true },
  source: { type: String, required: true, enum: ['authorization', 'organizations', 'keycloak-admin', 'fleet', 'invoices', 'invoice-sync', 'configuration', 'parametric-catalogs', 'audit'] },
  actor: { kind: { type: String, required: true, enum: ['user', 'service', 'system'] }, subject: { type: String, required: true, maxlength: 128 } },
  action: { type: String, required: true, maxlength: 96 }, captureOrigin: { type: String, enum: ['MANUAL', 'QR'] },
  changedFields: { type: [{ type: String, enum: ['origin', 'captureChannel', 'qrMetadata', 'assignmentId', 'invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amounts', 'imageId', 'offlineException'] }], default: undefined },
  result: { type: String, required: true, enum: ['allowed', 'denied'] },
  reason: { type: String, required: true, maxlength: 64 }, correlationId: { type: String, required: true, maxlength: 128 },
  scope: { type: scopeSchema, default: undefined }, resource: { type: resourceSchema, default: undefined },
  beforeVersion: { type: String, maxlength: 64 }, afterVersion: { type: String, maxlength: 64 },
  suppressed: { type: Number, min: 0 },
}, { strict: 'throw', versionKey: false, collection: 'audit_events' });
eventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'audit_retention_two_years' });
eventSchema.index({ 'actor.subject': 1, occurredAt: -1, _id: -1 }, { name: 'audit_actor_history' });

export const auditModel = (connection: Connection) => connection.models.AuditEvent ?? connection.model('AuditEvent', eventSchema);
export async function prepareMongoAudit(connection: Connection): Promise<void> { await auditModel(connection).init(); }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return '{' + entries.map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function createMongoAuditWriter(connection: Connection, session?: ClientSession): AuditWriter {
  const model = auditModel(connection);
  return { async record(input) {
    const event = normalizeAuditEvent(input);
    try {
      await model.init();
      const document = { _id: event.eventId, occurredAt: new Date(event.occurredAt), expiresAt: auditExpiresAt(event.occurredAt),
        source: event.source, actor: event.actor, action: event.action, ...(event.captureOrigin ? { captureOrigin: event.captureOrigin } : {}),
        ...(event.changedFields ? { changedFields: event.changedFields } : {}), result: event.result, reason: event.reason, correlationId: event.correlationId,
        ...(event.scope ? { scope: event.scope } : {}), ...(event.resource ? { resource: event.resource } : {}),
        ...(event.beforeVersion ? { beforeVersion: event.beforeVersion } : {}), ...(event.afterVersion ? { afterVersion: event.afterVersion } : {}), ...(event.suppressed !== undefined ? { suppressed: event.suppressed } : {}) };
      await model.updateOne({ _id: event.eventId }, { $setOnInsert: document }, { upsert: true, runValidators: true,
        ...(session ? { session } : { writeConcern: { w: 'majority', j: true } }) }).exec();
      const stored = await model.findById(event.eventId).session(session ?? null).lean().exec();
      if (!stored) throw new AuditUnavailable();
      const storedEvent = normalizeAuditEvent({ eventId: String(stored._id), occurredAt: new Date(stored.occurredAt as Date).toISOString(), source: stored.source,
        actor: stored.actor, action: stored.action, ...(stored.captureOrigin ? { captureOrigin: stored.captureOrigin } : {}),
        ...(stored.changedFields ? { changedFields: stored.changedFields } : {}), result: stored.result, reason: stored.reason, correlationId: stored.correlationId,
        ...(stored.scope ? { scope: stored.scope } : {}), ...(stored.resource ? { resource: stored.resource } : {}),
        ...(stored.beforeVersion ? { beforeVersion: stored.beforeVersion } : {}), ...(stored.afterVersion ? { afterVersion: stored.afterVersion } : {}), ...(stored.suppressed !== undefined ? { suppressed: stored.suppressed } : {}) });
      if (canonical(storedEvent) !== canonical(event)) throw new AuditEventConflict();
    } catch (error) {
      if (error instanceof AuditEventConflict) throw error;
      if (error instanceof AuditUnavailable) throw error;
      throw new AuditUnavailable(error);
    }
  } };
}
