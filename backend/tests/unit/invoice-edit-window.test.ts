import { describe, expect, it } from 'vitest';
import { evaluateInvoiceEditWindow } from '@/modules/invoices/domain/edit-window';
import type { InvoiceEditPolicy } from '@/modules/invoices/domain/edit-window';

const createdAt = new Date('2026-11-20T12:00:00.000Z');
const policy = (durationSeconds: number): InvoiceEditPolicy => ({ state: 'AVAILABLE', revision: 'rev-1', scope: 'third-party',
  validFrom: new Date('2026-11-20T00:00:00.000Z'), validUntil: null, durationSeconds });
const evaluate = (secondsAfter: number, duration = 60) => evaluateInvoiceEditWindow({ createdAt,
  now: new Date(createdAt.getTime() + secondsAfter * 1000), policy: policy(duration) });

describe('invoice edit window', () => {
  it('uses the effective duration for existing invoices and closes at the exclusive boundary', () => {
    expect(evaluate(59)).toBe('OPEN');
    expect(evaluate(60)).toBe('CLOSED');
    expect(evaluate(45, 30)).toBe('CLOSED');
    expect(evaluate(45, 60)).toBe('OPEN');
  });
  it('treats missing, invalid, and not-yet-effective policy as unavailable', () => {
    expect(evaluateInvoiceEditWindow({ createdAt, now: createdAt, policy: { ...policy(0) } })).toBe('POLICY_UNAVAILABLE');
    expect(evaluateInvoiceEditWindow({ createdAt, now: new Date('2026-11-19T00:00:00Z'), policy: policy(60) })).toBe('POLICY_UNAVAILABLE');
  });
});
