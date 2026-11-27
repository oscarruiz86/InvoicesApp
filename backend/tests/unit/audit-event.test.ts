import { describe, expect, it } from 'vitest';
import { auditExpiresAt, InvalidAuditEvent, isAllowedAuditAction, normalizeAuditEvent, type AuditEventSource } from '@/modules/audit/domain/audit-event';

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

  it('accepts Keycloak role-mapping actions while rejecting unapproved resource types', () => {
    expect(normalizeAuditEvent({ ...event(), source: 'keycloak-admin', action: 'KEYCLOAK_ADMIN_CREATE_CLIENT_SCOPE_CLIENT_MAPPING' }))
      .toMatchObject({ source: 'keycloak-admin', action: 'KEYCLOAK_ADMIN_CREATE_CLIENT_SCOPE_CLIENT_MAPPING' });
    expect(() => normalizeAuditEvent({ ...event(), source: 'keycloak-admin', action: 'KEYCLOAK_ADMIN_CREATE_SECRET_EXPORT' })).toThrow(InvalidAuditEvent);
  });

  it('accepts only the normalized invoice origin and approved field names', () => {
    expect(normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_CREATED', captureOrigin: 'QR', changedFields: ['invoiceNumber', 'qrMetadata'] }))
      .toMatchObject({ source: 'invoices', captureOrigin: 'QR', changedFields: ['invoiceNumber', 'qrMetadata'] });
    expect(() => normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_UPDATED', changedFields: ['payload'] })).toThrow(InvalidAuditEvent);
    expect(() => normalizeAuditEvent({ ...event(), source: 'invoices', action: 'INVOICE_CREATED', captureOrigin: 'QR', qrPayload: 'secret' })).toThrow(InvalidAuditEvent);
  });

  it('keeps all central producer action catalogs closed and integrated with audit read events', () => {
    const catalogs: Partial<Record<AuditEventSource, string[]>> = {
      authorization: ['ACCESS_DENIED','POLICY_CHANGED'],
      organizations: ['ACCESS_DENIED','COMPANY_CREATED','COMPANY_UPDATED','COMPANY_ACTIVATED','COMPANY_DEACTIVATED','COMPANY_ADMIN_ASSOCIATED','THIRD_PARTY_CREATED','THIRD_PARTY_UPDATED','THIRD_PARTY_ACTIVATED','THIRD_PARTY_DEACTIVATED','RELATIONSHIP_ACTIVATED','RELATIONSHIP_DEACTIVATED','INVITATION_CREATED','INVITATION_RESENT','INVITATION_ACCEPTED','INVITATION_REJECTED','INVITATION_CANCELLED','INVITATION_EXPIRED','INVITATION_DELIVERY_UNKNOWN','INVITATION_DELIVERY_LOGGED','INVITATION_DELIVERY_FAILED','MEMBERSHIP_UPDATED','CONTEXT_SELECTED','CONTEXT_SWITCH_REQUESTED','CONTEXT_RESTORED','CONTEXT_DENIED','CONTEXT_INVALIDATED'],
      fleet: ['DRIVER_PROVISIONED','DRIVER_MIGRATED','DRIVER_DEACTIVATED','DRIVER_ACTIVATED','VEHICLE_CREATED','VEHICLE_UPDATED','VEHICLE_ACTIVATED','VEHICLE_DEACTIVATED','ASSIGNMENT_CREATED','ASSIGNMENT_CLOSED'],
      invoices: ['INVOICE_CREATED','INVOICE_UPDATED'],
      'invoice-sync': ['SUBMISSION_LINKED_DUPLICATE','SUBMISSION_CLOSED_ASSIGNMENT_APPROVED','SUBMISSION_REJECTED'],
      configuration: ['PARAMETER_INITIALIZED','PARAMETER_UPDATED'],
      'parametric-catalogs': ['CATALOG_ENTRY_CREATED','CATALOG_ENTRY_UPDATED','CATALOG_ENTRY_REACTIVATED','CATALOG_ENTRY_DEACTIVATED'],
      audit: ['AUDIT_HISTORY_READ'],
    };
    for (const [source, actions] of Object.entries(catalogs) as [AuditEventSource, string[]][]) for (const action of actions) expect(isAllowedAuditAction(source, action), `${source}/${action}`).toBe(true);
    expect(isAllowedAuditAction('audit','POLICY_CHANGED')).toBe(false);
    expect(isAllowedAuditAction('fleet','AUDIT_HISTORY_READ')).toBe(false);
    expect(isAllowedAuditAction('keycloak-admin','KEYCLOAK_ADMIN_UPDATE_USER')).toBe(true);
    expect(isAllowedAuditAction('keycloak-admin','KEYCLOAK_ADMIN_EXPORT_TOKEN')).toBe(false);
  });

  it('rejects personally identifying actor values in place of an opaque subject identifier', () => {
    expect(() => normalizeAuditEvent({ ...event(), actor: { kind: 'user', subject: 'person@example.com' } })).toThrow(InvalidAuditEvent);
  });

  it('sets two calendar years of retention and handles leap-day dates', () => {
    expect(auditExpiresAt('2026-01-31T12:00:00.000Z').toISOString()).toBe('2028-01-31T12:00:00.000Z');
    expect(auditExpiresAt('2024-02-29T12:00:00.000Z').toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });
});
