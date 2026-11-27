import { describe, expect, it } from 'vitest';
import { createAuditHistoryQueries, type AuditHistoryReader } from '@/modules/audit/application/audit-history';
import type { AuditEvent } from '@/modules/audit/domain/audit-event';
import { AuditUnavailable } from '@/modules/audit/application/audit-ports';

const event = (id: string, occurredAt: string, sensitive = false): AuditEvent => ({ eventId: id, occurredAt, source: 'invoices', actor: { kind: 'user', subject: 'user_1' },
  action: 'INVOICE_UPDATED', result: 'allowed', reason: 'BUSINESS_MUTATION', correlationId: 'corr_1', ...(sensitive ? { captureOrigin: 'QR', changedFields: ['amounts'] } : {}) });

describe('audit history queries', () => {
  it('uses a snapshot cursor, omits each query own read event, and exposes it in a later query', async () => {
    const now = new Date('2026-11-26T10:00:00.000Z');
    const rows = [event('evt_3', '2026-11-25T00:00:00.000Z'), event('evt_2', '2026-11-24T00:00:00.000Z'), event('evt_1', '2026-11-23T00:00:00.000Z')];
    const recorded: AuditEvent[] = [];
    const reader: AuditHistoryReader = {
      async list(input) {
        const after = input.after;
        return [...rows, ...recorded].filter(row => Date.parse(row.occurredAt) <= Date.parse(input.snapshotAt)
          && !(input.excludeReadAt && row.source === 'audit' && row.action === 'AUDIT_HISTORY_READ' && Date.parse(row.occurredAt) === Date.parse(input.excludeReadAt))
          && (!after || row.occurredAt < after.occurredAt || row.occurredAt === after.occurredAt && row.eventId < after.eventId))
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.eventId.localeCompare(a.eventId)).slice(0, input.limit);
      }, async find(id) { return rows.find(row => row.eventId === id) ?? null; },
    };
    let n = 0;
    const queries = createAuditHistoryQueries({ reader, writer: { async record(value) { recorded.push(value); } }, now: () => now, nextId: () => `read_${++n}` });
    const first = await queries.list({ pageSize: 2, actorSubject: 'admin_1', correlationId: 'corr_a' });
    expect(first.items.map(row => row.eventId)).toEqual(['evt_3', 'evt_2']);
    expect(first.nextCursor).toBeTruthy();
    const second = await queries.list({ pageSize: 2, cursor: first.nextCursor!, actorSubject: 'admin_1', correlationId: 'corr_b' });
    expect(second.items.map(row => row.eventId)).toEqual(['evt_1']);
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ source: 'audit', action: 'AUDIT_HISTORY_READ', actor: { subject: 'admin_1' }, result: 'allowed' });
    expect(recorded[0]).not.toHaveProperty('filters');
    expect(recorded[0]).not.toHaveProperty('eventIdTarget');
    const later = await queries.list({ pageSize: 10, actorSubject: 'admin_1', correlationId: 'corr_c' });
    expect(later.items.map(row => row.eventId)).toContain('read_1');
  });

  it('maps to the allowlist and withholds the page when the durable read record fails', async () => {
    const queries = createAuditHistoryQueries({ reader: { async list() { return [event('evt_1', '2026-11-25T00:00:00.000Z', true)]; }, async find() { return event('evt_1', '2026-11-25T00:00:00.000Z', true); } },
      writer: { async record() { throw new Error('database detail'); } }, now: () => new Date('2026-11-26T10:00:00.000Z'), nextId: () => 'read_1' });
    await expect(queries.list({ pageSize: 20, actorSubject: 'admin_1', correlationId: 'corr_a' })).rejects.toBeInstanceOf(AuditUnavailable);
    const mapped = await (async () => {
      const ok = createAuditHistoryQueries({ reader: { async list() { return [event('evt_1', '2026-11-25T00:00:00.000Z', true)]; }, async find() { return null; } },
        writer: { async record() {} }, now: () => new Date('2026-11-26T10:00:00.000Z'), nextId: () => 'read_2' });
      return ok.list({ pageSize: 20, actorSubject: 'admin_1', correlationId: 'corr_b' });
    })();
    expect(mapped.items[0]).not.toHaveProperty('captureOrigin');
    expect(mapped.items[0]).not.toHaveProperty('changedFields');
  });
});
