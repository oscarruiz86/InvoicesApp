import { expect, it } from 'vitest';
import { createPolicyAuditOutboxWorker, runPolicyAuditOutboxLoop } from '@/modules/audit/application/policy-outbox-worker';
import type { SecurityEvent } from '@/modules/identity/application/authorization-ports';

const event: SecurityEvent = { eventId: 'event-1', at: new Date(0).toISOString(), subject: 'admin', action: 'POLICY_CHANGED', result: 'allowed',
  reason: 'POLICY', correlationId: 'correlation-1', suppressed: 0, beforeVersion: '1', afterVersion: '2' };

it('acknowledges only after durable Audit accepts an event and retries the same identity', async () => {
  let pending = [event]; let failAcknowledgement = true; const stored = new Set<string>(); let requestedLimit = 0;
  const worker = createPolicyAuditOutboxWorker({
    outbox: { async pendingEvents(limit) { requestedLimit = limit!; return pending; }, async acknowledgeEvent(id) { if (failAcknowledgement) throw Error('ACK_FAILED'); pending = pending.filter(item => item.eventId !== id); } },
    audit: { async record(value) { stored.add(value.eventId); } },
    map: value => ({ eventId: value.eventId, occurredAt: value.at, source: 'authorization', actor: { kind: 'user', subject: value.subject }, action: value.action,
      result: value.result, reason: value.reason, correlationId: value.correlationId }),
  });
  await expect(worker.deliverBatch(7)).rejects.toThrow('ACK_FAILED');
  expect([...stored]).toEqual(['event-1']); expect(pending).toHaveLength(1); expect(requestedLimit).toBe(7);
  failAcknowledgement = false;
  expect(await worker.deliverBatch(7)).toBe(1);
  expect([...stored]).toEqual(['event-1']); expect(pending).toHaveLength(0);
});

it('leaves the durable outbox untouched when Audit is unavailable', async () => {
  let acknowledged = false;
  const worker = createPolicyAuditOutboxWorker({ outbox: { async pendingEvents() { return [event]; }, async acknowledgeEvent() { acknowledged = true; } },
    audit: { async record() { throw Error('AUDIT_UNAVAILABLE'); } }, map: value => ({ eventId: value.eventId, occurredAt: value.at, source: 'authorization',
      actor: { kind: 'user', subject: value.subject }, action: value.action, result: value.result, reason: value.reason, correlationId: value.correlationId }) });
  await expect(worker.deliverBatch()).rejects.toThrow('AUDIT_UNAVAILABLE');
  expect(acknowledged).toBe(false);
});

it('backs off on errors, polls when idle, and stops after the current batch', async () => {
  const waits: number[] = []; const delivered: number[] = []; const errors: string[] = []; let stopping = false; let calls = 0;
  await runPolicyAuditOutboxLoop({ async deliverBatch() { calls++; if (calls === 1) throw new Error('AUDIT_UNAVAILABLE'); return 0; },
    isStopping: () => stopping, async wait(ms) { waits.push(ms); stopping = true; }, onDelivered: count => delivered.push(count),
    onError: error => errors.push(error instanceof Error ? error.message : 'unknown'), idleMs: 25, retryMs: 50 });
  expect(waits).toEqual([50]); expect(errors).toEqual(['AUDIT_UNAVAILABLE']); expect(delivered).toEqual([]); expect(calls).toBe(1);
  stopping = false; calls = 0;
  await runPolicyAuditOutboxLoop({ async deliverBatch() { calls++; return 0; }, isStopping: () => stopping, async wait(ms) { waits.push(ms); stopping = true; },
    onDelivered: count => delivered.push(count), onError: () => {}, idleMs: 25, retryMs: 50 });
  expect(waits).toEqual([50, 25]); expect(errors).toEqual(['AUDIT_UNAVAILABLE']); expect(calls).toBe(1);
  stopping = false; calls = 0;
  await runPolicyAuditOutboxLoop({ async deliverBatch() { calls++; return 2; }, isStopping: () => stopping, wait: async () => {},
    onDelivered(count) { delivered.push(count); stopping = true; }, onError: () => {} });
  expect(delivered).toEqual([2]); expect(calls).toBe(1);
});
