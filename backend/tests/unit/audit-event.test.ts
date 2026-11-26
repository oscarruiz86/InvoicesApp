import { describe, expect, it } from 'vitest';
import { auditExpiresAt, InvalidAuditEvent, normalizeAuditEvent } from '@/modules/audit/domain/audit-event';

const event = () => ({ eventId: 'event-1', occurredAt: '2026-01-31T12:00:00.000Z', source: 'authorization',
  actor: { kind: 'user', subject: 'subject-1' }, action: 'POLICY_CHANGED', result: 'allowed', reason: 'POLICY', correlationId: 'correlation-1',
  scope: { companyId: null, thirdPartyId: null }, resource: { type: 'authorization-policy', id: 'active' }, beforeVersion: '1', afterVersion: '2' });

describe('audit event contract', () => {
  it('normalizes a safe event without retaining unknown fields', () => {
    const input = { ...event(), ignored: 'must not be retained' };
    expect(() => normalizeAuditEvent(input)).toThrow(InvalidAuditEvent);
    expect(normalizeAuditEvent(event())).toMatchObject({ eventId: 'event-1', source: 'authorization', action: 'POLICY_CHANGED' });
  });

  it.each(['token', 'authorization', 'payload', 'claims', 'password'])('rejects arbitrary sensitive field %s', field => {
    expect(() => normalizeAuditEvent({ ...event(), [field]: 'sensitive' })).toThrow(InvalidAuditEvent);
  });

  it('accepts the closed fleet action catalog and rejects unknown sources and actions', () => {
    expect(normalizeAuditEvent({ ...event(), source: 'fleet', action: 'VEHICLE_CREATED' }).source).toBe('fleet');
    expect(() => normalizeAuditEvent({ ...event(), source: 'unknown' })).toThrow(InvalidAuditEvent);
    expect(() => normalizeAuditEvent({ ...event(), source: 'fleet', action: 'VEHICLE_SECRET_EXPORTED' })).toThrow(InvalidAuditEvent);
  });

  it('accepts only the normalized invoice origin and approved field names', () => {
    expect(normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_CREATED', captureOrigin: 'QR', changedFields: ['invoiceNumber', 'qrMetadata'] }))
      .toMatchObject({ source: 'invoices', captureOrigin: 'QR', changedFields: ['invoiceNumber', 'qrMetadata'] });
    expect(() => normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_UPDATED', changedFields: ['payload'] })).toThrow(InvalidAuditEvent);
    expect(() => normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_CREATED', captureOrigin: 'QR', qrPayload: 'secret' })).toThrow(InvalidAuditEvent);
  });

  it('rejects personally identifying actor values in place of an opaque subject identifier', () => {
    expect(() => normalizeAuditEvent({ ...event(), actor: { kind: 'user', subject: 'person@example.com' } })).toThrow(InvalidAuditEvent);
  });

  it('sets two calendar years of retention and handles leap-day dates', () => {
    expect(auditExpiresAt('2026-01-31T12:00:00.000Z').toISOString()).toBe('2028-01-31T12:00:00.000Z');
    expect(auditExpiresAt('2024-02-29T12:00:00.000Z').toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });
});
