import type { AuditEvent } from '../domain/audit-event';

export interface AuditWriter {
  record(event: AuditEvent): Promise<void>;
}

export class AuditEventConflict extends Error {
  constructor() { super('AUDIT_EVENT_CONFLICT'); }
}

export class AuditUnavailable extends Error {
  constructor(readonly cause?: unknown) { super('AUDIT_UNAVAILABLE'); }
}
