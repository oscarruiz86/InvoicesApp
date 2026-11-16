import { Schema, type Connection } from 'mongoose';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { ContextAudit } from '../../application/context-ports';

const schema = new Schema({ _id: String, correlationId: { type: String, required: true }, at: { type: Date, required: true }, subject: { type: String, required: true },
  action: { type: String, required: true, enum: ['CONTEXT_SELECTED', 'CONTEXT_SWITCH_REQUESTED', 'CONTEXT_RESTORED', 'CONTEXT_DENIED', 'CONTEXT_INVALIDATED'] },
  result: { type: String, enum: ['allowed', 'denied'], required: true }, kind: { type: String, enum: ['GLOBAL', 'ORGANIZATION'] },
  organizationId: String, organizationType: { type: String, enum: ['COMPANY', 'THIRD_PARTY'] }, suppressed: { type: Number, required: true, min: 0 }, delivered: { type: Boolean, default: false },
}, { strict: 'throw', versionKey: false, collection: 'organization_context_events' });
schema.index({ delivered: 1, at: 1 });
export function createContextAudit(connect: () => Promise<Connection>): ContextAudit {
  return { async record(event) {
    try {
      const connection = await connect();
      const model = connection.models.OrganizationContextEvent ?? connection.model('OrganizationContextEvent', schema);
      const selection = event.result === 'allowed' ? event.selection : undefined;
      const data = { _id: event.eventId, correlationId: event.correlationId, at: new Date(event.at), subject: event.subject,
        action: event.action, result: event.result, suppressed: event.suppressed, delivered: false,
        ...(selection ? { kind: selection.kind } : {}),
        ...(selection?.kind === 'ORGANIZATION' ? { organizationId: selection.organizationId, organizationType: selection.organizationType } : {}) };
      await model.updateOne({ _id: event.eventId }, { $setOnInsert: data }, { upsert: true, runValidators: true, writeConcern: { w: 'majority', j: true } }).exec();
    } catch { throw new AuthorizationUnavailable(); }
  } };
}
