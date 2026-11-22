import { randomUUID } from 'node:crypto';
import type { ClientSession, Connection } from 'mongoose';
import { isParameterKey, parameterCatalog, validateParameterValue, type ParameterKey } from '../../domain/parameters';
import type { ParameterEvent, ParameterRepository, ParameterRow } from '../../application/parameters';
import { ParameterError } from '../../application/parameters';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';

const parameters = 'functional_parameters';
const events = 'configuration_events';
type Row = Record<string, unknown>;
function decode(row: Row): ParameterRow {
  if (typeof row.key !== 'string' || !isParameterKey(row.key) || !validateParameterValue(row.key, row.value)
    || row.scope !== 'global' || !Number.isSafeInteger(row.version) || Number(row.version) < 1
    || !(row.effectiveFrom instanceof Date) || !(row.createdAt instanceof Date) || !(row.updatedAt instanceof Date)
    || typeof row.createdBy !== 'string' || typeof row.updatedBy !== 'string') throw new ParameterError('STORAGE_UNAVAILABLE');
  return { key: row.key, value: row.value, version: Number(row.version), effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt, createdBy: row.createdBy, updatedAt: row.updatedAt, updatedBy: row.updatedBy };
}
function decodeEvent(row: Row): ParameterEvent {
  if (typeof row.eventId !== 'string' || typeof row.correlationId !== 'string' || typeof row.key !== 'string' || !isParameterKey(row.key)
    || typeof row.actor !== 'string' || !(row.at instanceof Date) || !Number.isSafeInteger(row.previousValue) || !Number.isSafeInteger(row.value)
    || !Number.isSafeInteger(row.previousVersion) || !Number.isSafeInteger(row.version)) throw new ParameterError('STORAGE_UNAVAILABLE');
  return { eventId: row.eventId, correlationId: row.correlationId, key: row.key, actor: row.actor, at: row.at,
    previousValue: Number(row.previousValue), value: Number(row.value), previousVersion: Number(row.previousVersion), version: Number(row.version) };
}
function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('hasErrorLabel' in error) || typeof error.hasErrorLabel !== 'function') return false;
  return error.hasErrorLabel('TransientTransactionError') || error.hasErrorLabel('UnknownTransactionCommitResult');
}

export async function inventoryParameters(connection: Connection) {
  const rows = await connection.collection(parameters).find({}).toArray();
  const seen = new Set<string>(); const issues: string[] = [];
  for (const row of rows) {
    const key = String(row.key ?? '');
    if (!isParameterKey(key)) issues.push(`unknown-key:${key || '(empty)'}`);
    if (seen.has(`${row.scope}:${key}`)) issues.push(`duplicate:${row.scope}:${key}`);
    seen.add(`${row.scope}:${key}`);
    if (row.scope !== 'global' || !validateParameterValue(key, row.value)) issues.push(`invalid:${row.scope}:${key}`);
  }
  const eventRows = await connection.collection(events).find({}).toArray();
  const eventIds = new Set<string>();
  for (const row of eventRows) {
    if (!isParameterKey(String(row.key ?? ''))) issues.push(`unknown-event-key:${String(row.key ?? '')}`);
    if (typeof row.eventId !== 'string' || eventIds.has(row.eventId)) issues.push(`duplicate-event:${String(row.eventId ?? '')}`);
    if (typeof row.eventId === 'string') eventIds.add(row.eventId);
  }
  return { ready: issues.length === 0, parameters: rows.length, events: eventRows.length, issues };
}

export function createMongoParameterRepository(connect: () => Promise<Connection>, ids: { next(): string } = { next: randomUUID },
  confirmPolicy?: (connection: Connection, session: ClientSession) => PolicyConfirmation): ParameterRepository {
  async function ready(connection: Connection) {
    const inventory = await inventoryParameters(connection);
    if (!inventory.ready) throw new ParameterError('STORAGE_UNAVAILABLE');
    await Promise.all([
      connection.collection(parameters).createIndex({ scope: 1, key: 1 }, { unique: true, name: 'functional_parameters_scope_key_unique' }),
      connection.collection(events).createIndex({ eventId: 1 }, { unique: true, name: 'configuration_events_event_id_unique' }),
      connection.collection(events).createIndex({ key: 1, at: -1, eventId: -1 }, { name: 'configuration_events_timeline' }),
    ]);
  }
  async function transaction<T>(fn: (connection: Connection, session: ClientSession) => Promise<T>): Promise<T> {
    try { const connection = await connect(); await ready(connection); return await connection.transaction(session => fn(connection, session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 }); }
    catch (error) { if (error instanceof ParameterError) throw error; throw new ParameterError('STORAGE_UNAVAILABLE'); }
  }
  return {
    async list(input) {
      const connection = await connect(); await ready(connection);
      const filter = { scope: 'global', ...(input.q ? { $or: [{ key: { $regex: input.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] } : {}) };
      const [rows, total] = await Promise.all([connection.collection(parameters).find(filter).sort({ key: 1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(), connection.collection(parameters).countDocuments(filter)]);
      return { items: rows.map(row => decode(row as Row)), total };
    },
    async find(key) { const connection = await connect(); await ready(connection); const row = await connection.collection(parameters).findOne({ key, scope: 'global' }); return row ? decode(row as Row) : null; },
    async readEffective(key) { return this.find(key); },
    async history(key, page, pageSize) {
      const connection = await connect(); await ready(connection); const filter = { key };
      const [rows, total] = await Promise.all([connection.collection(events).find(filter).sort({ at: -1, eventId: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), connection.collection(events).countDocuments(filter)]);
      return { items: rows.map(row => decodeEvent(row as Row)), total };
    },
    async update(input) {
      return transaction(async (connection, session) => {
        if (confirmPolicy) {
          if (!input.policyVersion || !/^[1-9]\d*$/.test(input.policyVersion)) throw new ParameterError('FORBIDDEN');
          try { await confirmPolicy(connection, session).confirm(input.policyVersion); }
          catch (error) { if (isRetryableTransactionError(error)) throw error; throw new ParameterError('FORBIDDEN'); }
        }
        const now = new Date(); const current = await connection.collection(parameters).findOne({ key: input.key, scope: 'global' }, { session });
        if (!current) throw new ParameterError('PARAMETER_NOT_INITIALIZED');
        const previous = decode(current as Row);
        if (previous.version !== input.expectedVersion) throw new ParameterError('PARAMETER_VERSION_CONFLICT');
        if (previous.value === input.value) return previous;
        const version = previous.version + 1;
        const changed = await connection.collection(parameters).updateOne({ key: input.key, scope: 'global', version: previous.version },
          { $set: { value: input.value, version, effectiveFrom: now, updatedAt: now, updatedBy: input.actor }, $inc: { mutationFence: 1 } }, { session });
        if (changed.modifiedCount !== 1) throw new ParameterError('PARAMETER_VERSION_CONFLICT');
        await connection.collection(events).insertOne({ eventId: ids.next(), correlationId: input.correlationId, key: input.key, actor: input.actor,
          at: now, previousValue: previous.value, value: input.value, previousVersion: previous.version, version }, { session });
        return decode({ ...current, value: input.value, version, effectiveFrom: now, updatedAt: now, updatedBy: input.actor });
      });
    },
    async confirm(input) {
      const context = input.session as { session?: ClientSession };
      const session = context?.session;
      if (!session || !session.inTransaction()) throw new ParameterError('EDIT_POLICY_UNAVAILABLE');
      const changed = await (await connect()).collection(parameters).updateOne({ key: input.key, scope: 'global', version: Number(input.revision) }, { $inc: { mutationFence: 1 } }, { session });
      if (changed.modifiedCount !== 1) throw new ParameterError('EDIT_POLICY_UNAVAILABLE');
    },
    async initialize(actor, correlationId) {
      return transaction(async (connection, session) => {
        const key = Object.keys(parameterCatalog)[0] as ParameterKey;
        if (await connection.collection(parameters).findOne({ key, scope: 'global' }, { session })) return false;
        const now = new Date(); const value = parameterCatalog[key].initialValue;
        await connection.collection(parameters).insertOne({ key, scope: 'global', value, version: 1, mutationFence: 0, effectiveFrom: now, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor }, { session });
        await connection.collection(events).insertOne({ eventId: ids.next(), correlationId, key, actor, at: now, previousValue: value, value, previousVersion: 0, version: 1 }, { session });
        return true;
      });
    },
  };
}
