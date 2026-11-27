import { createHash } from 'node:crypto';
import type { AuditEvent, AuditEventSource } from '../domain/audit-event';
import { AuditUnavailable, type AuditWriter } from './audit-ports';

export interface AuditHistoryFilters { readonly from?: string; readonly to?: string; readonly source?: AuditEventSource; readonly action?: string; readonly result?: 'allowed' | 'denied'; readonly actorSubjects?: readonly string[] }
export interface AuditHistoryPosition { readonly occurredAt: string; readonly eventId: string }
export interface AuditHistoryReader {
  list(input: AuditHistoryFilters & { readonly snapshotAt: string; readonly after?: AuditHistoryPosition; readonly excludeReadAt?: string; readonly limit: number }): Promise<readonly AuditEvent[]>;
  find(eventId: string): Promise<AuditEvent | null>;
}
export interface SafeAuditEvent {
  readonly eventId: string; readonly occurredAt: string; readonly source: AuditEventSource;
  readonly actor: AuditEvent['actor'] & { readonly displayName?: string }; readonly action: string; readonly result: AuditEvent['result']; readonly reason: string;
  readonly correlationId: string; readonly scope?: AuditEvent['scope']; readonly resource?: AuditEvent['resource'];
  readonly displayNames?: { readonly company?: string; readonly thirdParty?: string; readonly resource?: string };
  readonly beforeVersion?: string; readonly afterVersion?: string; readonly suppressed?: number;
}
export const safeAuditEvent = (event: AuditEvent): SafeAuditEvent => ({ eventId: event.eventId, occurredAt: event.occurredAt, source: event.source,
  actor: event.actor, action: event.action, result: event.result, reason: event.reason, correlationId: event.correlationId,
  ...(event.scope ? { scope: event.scope } : {}), ...(event.resource ? { resource: event.resource } : {}),
  ...(event.beforeVersion ? { beforeVersion: event.beforeVersion } : {}), ...(event.afterVersion ? { afterVersion: event.afterVersion } : {}),
  ...(event.suppressed !== undefined ? { suppressed: event.suppressed } : {}) });
export class AuditHistoryNotFound extends Error { constructor() { super('AUDIT_HISTORY_NOT_FOUND'); } }
export class AuditHistoryInvalid extends Error { constructor() { super('AUDIT_HISTORY_INVALID'); } }

/** Never accepts request filters or target event data; only verified identity and request trace fields. */
export function auditHistoryReadEvent(input: { eventId: string; occurredAt: string; actorSubject: string; correlationId: string }): AuditEvent {
  return { eventId: input.eventId, occurredAt: input.occurredAt, source: 'audit', actor: { kind: 'user', subject: input.actorSubject },
    action: 'AUDIT_HISTORY_READ', result: 'allowed', reason: 'AUDIT_HISTORY_READ', correlationId: input.correlationId };
}

const fingerprint = (filters: AuditHistoryFilters) => createHash('sha256').update(JSON.stringify({ from: filters.from ?? null, to: filters.to ?? null, source: filters.source ?? null, action: filters.action ?? null, result: filters.result ?? null, actorSubjects: filters.actorSubjects ?? null })).digest('base64url');
function encodeCursor(position: AuditHistoryPosition, filters: AuditHistoryFilters, snapshotAt: string): string {
  return Buffer.from(JSON.stringify({ v: 1, position, fingerprint: fingerprint(filters), snapshotAt })).toString('base64url');
}
function decodeCursor(value: string, filters: AuditHistoryFilters): { position: AuditHistoryPosition; snapshotAt: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const raw = JSON.parse(decoded) as Record<string, unknown>;
    if (raw.v !== 1 || raw.fingerprint !== fingerprint(filters) || typeof raw.snapshotAt !== 'string' || !Number.isFinite(Date.parse(raw.snapshotAt))
      || !raw.position || typeof raw.position !== 'object') throw new Error();
    const position = raw.position as Record<string, unknown>;
    if (typeof position.occurredAt !== 'string' || !Number.isFinite(Date.parse(position.occurredAt)) || typeof position.eventId !== 'string' || !/^[A-Za-z0-9_:@-]{1,128}$/u.test(position.eventId)) throw new Error();
    return { position: { occurredAt: new Date(position.occurredAt).toISOString(), eventId: position.eventId }, snapshotAt: new Date(raw.snapshotAt).toISOString() };
  } catch { throw new AuditHistoryInvalid(); }
}
export function createAuditHistoryQueries(deps: { reader: AuditHistoryReader; writer: AuditWriter; now(): Date; nextId(): string }) {
  const recordRead = async (actorSubject: string, correlationId: string) => {
    const eventId = deps.nextId();
    try { await deps.writer.record(auditHistoryReadEvent({ eventId, occurredAt: deps.now().toISOString(), actorSubject, correlationId })); }
    catch (error) { throw new AuditUnavailable(error); }
  };
  return {
    async list(input: AuditHistoryFilters & { pageSize: number; cursor?: string; actorSubject: string; correlationId: string }) {
      const cursor = input.cursor ? decodeCursor(input.cursor, input) : undefined;
      const snapshotAt = cursor?.snapshotAt ?? deps.now().toISOString();
      const after = cursor?.position;
      let rows: readonly AuditEvent[];
      try { rows = await deps.reader.list({ ...input, snapshotAt, ...(after ? { after } : {}), ...(cursor ? { excludeReadAt: snapshotAt } : {}), limit: input.pageSize + 1 }); }
      catch (error) { throw new AuditUnavailable(error); }
      const page = rows.slice(0, input.pageSize);
      await recordRead(input.actorSubject, input.correlationId);
      const last = page.at(-1);
      return { items: page.map(safeAuditEvent), nextCursor: rows.length > input.pageSize && last ? encodeCursor({ occurredAt: last.occurredAt, eventId: last.eventId }, input, snapshotAt) : null, pageSize: input.pageSize };
    },
    async detail(eventId: string, actorSubject: string, correlationId: string) {
      let event: AuditEvent | null;
      try { event = await deps.reader.find(eventId); } catch (error) { throw new AuditUnavailable(error); }
      await recordRead(actorSubject, correlationId);
      if (!event) throw new AuditHistoryNotFound();
      return safeAuditEvent(event);
    },
  };
}
