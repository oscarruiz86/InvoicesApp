import type { SecurityEvent } from '@/modules/identity/application/authorization-ports';
import type { AuditWriter } from './audit-ports';
import type { AuditEvent } from '../domain/audit-event';

export interface PolicyAuditOutbox {
  pendingEvents(limit?: number): Promise<readonly SecurityEvent[]>;
  acknowledgeEvent(eventId: string): Promise<void>;
}

export function createPolicyAuditOutboxWorker(dependencies: { outbox: PolicyAuditOutbox; audit: AuditWriter; map(event: SecurityEvent): AuditEvent }) {
  return { async deliverBatch(limit = 100): Promise<number> {
    const events = await dependencies.outbox.pendingEvents(limit);
    let delivered = 0;
    for (const event of events) {
      await dependencies.audit.record(dependencies.map(event));
      await dependencies.outbox.acknowledgeEvent(event.eventId);
      delivered++;
    }
    return delivered;
  } };
}

export async function runPolicyAuditOutboxLoop(dependencies: { deliverBatch(): Promise<number>; isStopping(): boolean; wait(ms: number): Promise<unknown>;
  onDelivered(count: number): void; onError(error: unknown): void; idleMs?: number; retryMs?: number }): Promise<void> {
  const idleMs = dependencies.idleMs ?? 1000; const retryMs = dependencies.retryMs ?? 5000;
  while (!dependencies.isStopping()) {
    try {
      const delivered = await dependencies.deliverBatch();
      if (delivered > 0) dependencies.onDelivered(delivered);
      else await dependencies.wait(idleMs);
    } catch (error) {
      dependencies.onError(error);
      await dependencies.wait(retryMs);
    }
  }
}
