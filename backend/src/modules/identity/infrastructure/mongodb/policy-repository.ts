import { Schema, type Connection, type ClientSession } from 'mongoose';
import type { PolicyConfirmation } from '../../application/policy-confirmation';
import { z } from 'zod';
import { grantCeiling, permissions, validPolicyGrants, type AuthorizationPolicy, type Grant } from '../../domain/permissions';
import type { PolicyReader, PolicyWriter, SecurityEvent } from '../../application/authorization-ports';
import { AuthorizationUnavailable, InvalidAuthorizationRequest, PolicyAuditCapacity, PolicyConflict } from '../../application/authorization-errors';

const grantSchema = z.object({ role: z.enum(['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']), permission: z.enum(permissions), scope: z.enum(['self', 'global', 'company', 'third-party']) }).strict();
const securityEventSchema = z.object({ eventId: z.string().min(1).max(128), at: z.string().datetime(), subject: z.string().min(1).max(128),
  action: z.enum(['ACCESS_DENIED', 'POLICY_CHANGED']), result: z.enum(['denied', 'allowed']), reason: z.enum(['PERMISSION', 'CONTEXT', 'RESOURCE', 'ELIGIBILITY', 'POLICY']),
  correlationId: z.string().min(1).max(128), suppressed: z.number().int().nonnegative(), permission: z.enum(permissions).optional(),
  scope: z.object({ kind: z.enum(['self', 'global', 'organization']), companyId: z.string().nullable(), thirdPartyId: z.string().nullable() }).strict().optional(),
  resource: z.object({ type: z.literal('authorization-policy'), id: z.literal('active') }).strict().optional(), beforeVersion: z.string().optional(), afterVersion: z.string().optional() }).strict();
const schema = new Schema({ _id: String, version: { type: Number, required: true }, grants: { type: [new Schema({ role: String, permission: String, scope: String }, { _id: false })], required: true }, pendingEvents: { type: [Schema.Types.Mixed], default: [] } }, { versionKey: false, strict: 'throw', collection: 'authorization_policies' });
function decode(value: unknown): AuthorizationPolicy {
  const parsed = z.object({ version: z.number().int().positive(), grants: z.array(grantSchema) }).safeParse(value);
  if (!parsed.success || !validPolicyGrants(parsed.data.grants as Grant[])) throw new AuthorizationUnavailable();
  return { version: String(parsed.data.version), grants: parsed.data.grants as Grant[] };
}
/** Transaction participant injected by composition; Organizations never owns this collection. */
export function policyConfirmation(connection: Connection, session: ClientSession): PolicyConfirmation {
  const collection = connection.collection('authorization_policies');
  return {
    async read() { return decode(await collection.findOne({ _id: 'active' as never }, { session })); },
    async confirm(expectedVersion) {
      const result = await collection.updateOne({ _id: 'active' as never, version: Number(expectedVersion) }, { $inc: { mutationFence: 1 } }, { session });
      if (result.modifiedCount !== 1) throw new AuthorizationUnavailable();
    },
  };
}
export function createPolicyRepository(connect: () => Promise<Connection>): PolicyReader & PolicyWriter & {
  initialize(): Promise<AuthorizationPolicy>; pendingEvents(limit?: number): Promise<readonly SecurityEvent[]>; acknowledgeEvent(eventId: string): Promise<void>;
} {
  const model = async () => { const connection = await connect(); return connection.models.AuthorizationPolicy ?? connection.model('AuthorizationPolicy', schema); };
  const read = async () => {
    try { return decode(await (await model()).findById('active').lean().exec()); }
    catch { throw new AuthorizationUnavailable(); }
  };
  return {
    read,
    async initialize() {
      try { await (await model()).updateOne({ _id: 'active' }, { $setOnInsert: { version: 1, grants: grantCeiling, pendingEvents: [] } }, { upsert: true }).exec(); return await read(); }
      catch { throw new AuthorizationUnavailable(); }
    },
    async pendingEvents(limit = 100) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new InvalidAuthorizationRequest();
      try {
        const value = await (await model()).findById('active').select({ pendingEvents: 1 }).lean().exec();
        if (!value) throw new AuthorizationUnavailable();
        const parsed = z.array(securityEventSchema).safeParse(value.pendingEvents);
        if (!parsed.success) throw new AuthorizationUnavailable();
        return parsed.data.slice(0, limit) as SecurityEvent[];
      } catch (error) { if (error instanceof AuthorizationUnavailable) throw error; throw new AuthorizationUnavailable(); }
    },
    async acknowledgeEvent(eventId: string) {
      if (typeof eventId !== 'string' || eventId.length < 1 || eventId.length > 128) throw new InvalidAuthorizationRequest();
      try {
        const result = await (await model()).updateOne({ _id: 'active' }, { $pull: { pendingEvents: { eventId } } }).exec();
        if (result.matchedCount !== 1) throw new AuthorizationUnavailable();
      } catch (error) { if (error instanceof AuthorizationUnavailable || error instanceof InvalidAuthorizationRequest) throw error; throw new AuthorizationUnavailable(); }
    },
    async replace(expectedVersion: string, grants: readonly Grant[], event: SecurityEvent) {
      if (!/^[1-9]\d*$/.test(expectedVersion) || !validPolicyGrants(grants) || event.action !== 'POLICY_CHANGED' || event.beforeVersion !== expectedVersion) throw new InvalidAuthorizationRequest();
      const version = Number(expectedVersion);
      if (!Number.isSafeInteger(version + 1)) throw new InvalidAuthorizationRequest();
      const captured: SecurityEvent = { eventId: event.eventId, at: event.at, subject: event.subject, action: 'POLICY_CHANGED', result: 'allowed', reason: 'POLICY', correlationId: event.correlationId, suppressed: 0, beforeVersion: expectedVersion, afterVersion: String(version + 1), permission: 'roles:manage', scope: { kind: 'global', companyId: null, thirdPartyId: null }, resource: { type: 'authorization-policy', id: 'active' } };
      if (![captured.eventId, captured.subject, captured.correlationId].every(value => typeof value === 'string' && value.length > 0) || !Number.isFinite(Date.parse(captured.at))) throw new InvalidAuthorizationRequest();
      try {
        const updated = await (await model()).findOneAndUpdate({ _id: 'active', version, 'pendingEvents.999': { $exists: false } }, { $set: { grants }, $inc: { version: 1 }, $push: { pendingEvents: captured } }, { returnDocument: 'after', runValidators: true }).lean().exec();
        if (!updated) {
          const current = await (await model()).findById('active').select({ version: 1, pendingEvents: 1 }).lean().exec();
          if (!current) throw new AuthorizationUnavailable();
          if (current.version === version && Array.isArray(current.pendingEvents) && current.pendingEvents.length >= 1000) throw new PolicyAuditCapacity();
          throw new PolicyConflict();
        }
        return decode(updated);
      } catch (error) { if (error instanceof PolicyConflict || error instanceof PolicyAuditCapacity) throw error; throw new AuthorizationUnavailable(); }
    },
  };
}
