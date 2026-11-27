export type AuditEventSource = 'authorization' | 'organizations' | 'keycloak-admin' | 'fleet' | 'invoices' | 'invoice-sync' | 'configuration' | 'parametric-catalogs' | 'audit';
export type AuditActorKind = 'user' | 'service' | 'system';
export type AuditResult = 'allowed' | 'denied';

export interface AuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly source: AuditEventSource;
  readonly actor: { readonly kind: AuditActorKind; readonly subject: string };
  readonly action: string;
  readonly captureOrigin?: 'MANUAL' | 'QR';
  readonly changedFields?: readonly string[];
  readonly result: AuditResult;
  readonly reason: string;
  readonly correlationId: string;
  readonly scope?: { readonly companyId: string | null; readonly thirdPartyId: string | null };
  readonly resource?: { readonly type: string; readonly id: string | null };
  readonly beforeVersion?: string;
  readonly afterVersion?: string;
  readonly suppressed?: number;
}

export class InvalidAuditEvent extends Error {
  constructor() { super('AUDIT_EVENT_INVALID'); }
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const text = (value: unknown, max: number, pattern = /^[\w.:@/-]+$/u): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && pattern.test(value);
const opaqueId = (value: unknown): value is string | null => value === null || text(value, 128, /^[A-Za-z0-9_:@-]+$/u);

const actionsBySource: Readonly<Record<Exclude<AuditEventSource, 'keycloak-admin'>, ReadonlySet<string>>> = {
  authorization: new Set(['ACCESS_DENIED', 'POLICY_CHANGED']),
  organizations: new Set(['ACCESS_DENIED', 'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_ACTIVATED', 'COMPANY_DEACTIVATED',
    'COMPANY_ADMIN_ASSOCIATED',
    'THIRD_PARTY_CREATED', 'THIRD_PARTY_UPDATED', 'THIRD_PARTY_ACTIVATED', 'THIRD_PARTY_DEACTIVATED', 'RELATIONSHIP_ACTIVATED',
    'RELATIONSHIP_DEACTIVATED', 'INVITATION_CREATED', 'INVITATION_RESENT', 'INVITATION_ACCEPTED', 'INVITATION_REJECTED', 'INVITATION_CANCELLED', 'INVITATION_EXPIRED',
    'INVITATION_DELIVERY_UNKNOWN', 'INVITATION_DELIVERY_LOGGED', 'INVITATION_DELIVERY_FAILED',
    'MEMBERSHIP_UPDATED', 'CONTEXT_SELECTED', 'CONTEXT_SWITCH_REQUESTED', 'CONTEXT_RESTORED', 'CONTEXT_DENIED', 'CONTEXT_INVALIDATED']),
  fleet: new Set(['DRIVER_PROVISIONED', 'DRIVER_MIGRATED', 'DRIVER_DEACTIVATED', 'DRIVER_ACTIVATED', 'VEHICLE_CREATED', 'VEHICLE_UPDATED',
    'VEHICLE_ACTIVATED', 'VEHICLE_DEACTIVATED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_CLOSED']),
  invoices: new Set(['INVOICE_CREATED', 'INVOICE_UPDATED']),
  'invoice-sync': new Set(['SUBMISSION_LINKED_DUPLICATE', 'SUBMISSION_CLOSED_ASSIGNMENT_APPROVED', 'SUBMISSION_REJECTED']),
  configuration: new Set(['PARAMETER_INITIALIZED', 'PARAMETER_UPDATED']),
  'parametric-catalogs': new Set(['CATALOG_ENTRY_CREATED', 'CATALOG_ENTRY_UPDATED', 'CATALOG_ENTRY_REACTIVATED', 'CATALOG_ENTRY_DEACTIVATED']),
  audit: new Set(['AUDIT_HISTORY_READ']),
};

const keycloakOperations = new Set(['CREATE', 'UPDATE', 'DELETE', 'ACTION', 'ACTION_TOKEN', 'REMOVE', 'SET_PASSWORD', 'RESET_PASSWORD', 'IMPERSONATE']);
const keycloakResources = new Set(['USER', 'REALM', 'CLIENT', 'CLIENT_SCOPE', 'CLIENT_SCOPE_CLIENT_MAPPING', 'CLIENT_ROLE_MAPPING', 'REALM_ROLE_MAPPING', 'USER_ROLE_MAPPING', 'ROLE', 'GROUP', 'IDENTITY_PROVIDER', 'USER_FEDERATION', 'AUTHENTICATOR', 'COMPONENT', 'PROTOCOL_MAPPER', 'AUTHORIZATION', 'SCOPE']);
const invoiceChangedFields = new Set(['origin', 'captureChannel', 'qrMetadata', 'assignmentId', 'invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amounts', 'imageId', 'offlineException']);
export function isAllowedAuditAction(source: AuditEventSource, action: string): boolean {
  if (source !== 'keycloak-admin') return actionsBySource[source].has(action);
  const match = /^KEYCLOAK_ADMIN_(CREATE|UPDATE|DELETE|ACTION|ACTION_TOKEN|REMOVE|SET_PASSWORD|RESET_PASSWORD|IMPERSONATE)_([A-Z0-9_]+)$/u.exec(action);
  return Boolean(match && keycloakOperations.has(match[1]) && keycloakResources.has(match[2]));
}

export function normalizeAuditEvent(value: unknown): AuditEvent {
  if (!record(value) || !keysAre(value, ['eventId', 'occurredAt', 'source', 'actor', 'action', 'captureOrigin', 'changedFields', 'result', 'reason', 'correlationId', 'scope', 'resource', 'beforeVersion', 'afterVersion', 'suppressed'])) throw new InvalidAuditEvent();
  if (!text(value.eventId, 128, /^[A-Za-z0-9_:@-]+$/u) || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt)) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value.occurredAt)
      || !['authorization', 'organizations', 'keycloak-admin', 'fleet', 'invoices', 'invoice-sync', 'configuration', 'parametric-catalogs', 'audit'].includes(String(value.source)) || !record(value.actor)
      || !keysAre(value.actor, ['kind', 'subject']) || !['user', 'service', 'system'].includes(String(value.actor.kind))
      || !text(value.actor.subject, 128, /^[A-Za-z0-9_:-]+$/u) || !text(value.action, 96, /^[A-Z][A-Z0-9_:-]*$/u)
      || !isAllowedAuditAction(value.source as AuditEventSource, value.action)
      || value.captureOrigin !== undefined && (value.source !== 'invoices' || !['MANUAL', 'QR'].includes(String(value.captureOrigin)))
      || value.changedFields !== undefined && (value.source !== 'invoices' || !Array.isArray(value.changedFields) || value.changedFields.length > 16
        || new Set(value.changedFields).size !== value.changedFields.length || value.changedFields.some(field => typeof field !== 'string' || !invoiceChangedFields.has(field)))
      || !['allowed', 'denied'].includes(String(value.result)) || !text(value.reason, 64, /^[A-Z][A-Z0-9_:-]*$/u)
      || !text(value.correlationId, 128, /^[A-Za-z0-9_:@-]+$/u)) throw new InvalidAuditEvent();
  if (value.scope !== undefined && (!record(value.scope) || !keysAre(value.scope, ['companyId', 'thirdPartyId']) || !opaqueId(value.scope.companyId) || !opaqueId(value.scope.thirdPartyId))) throw new InvalidAuditEvent();
  if (value.resource !== undefined && (!record(value.resource) || !keysAre(value.resource, ['type', 'id']) || !text(value.resource.type, 64, /^[a-z][a-z0-9-]*$/u) || !opaqueId(value.resource.id))) throw new InvalidAuditEvent();
  if (value.beforeVersion !== undefined && !text(value.beforeVersion, 64, /^[A-Za-z0-9_:-]+$/u)) throw new InvalidAuditEvent();
  if (value.afterVersion !== undefined && !text(value.afterVersion, 64, /^[A-Za-z0-9_:-]+$/u)) throw new InvalidAuditEvent();
  if (value.suppressed !== undefined && (!Number.isSafeInteger(value.suppressed) || Number(value.suppressed) < 0)) throw new InvalidAuditEvent();
  return {
    eventId: value.eventId, occurredAt: new Date(value.occurredAt).toISOString(), source: value.source as AuditEventSource,
    actor: { kind: value.actor.kind as AuditActorKind, subject: value.actor.subject }, action: value.action,
    ...(value.captureOrigin !== undefined ? { captureOrigin: value.captureOrigin as 'MANUAL' | 'QR' } : {}),
    ...(value.changedFields !== undefined ? { changedFields: [...value.changedFields] as string[] } : {}),
    result: value.result as AuditResult, reason: value.reason, correlationId: value.correlationId,
    ...(value.scope ? { scope: { companyId: value.scope.companyId as string | null, thirdPartyId: value.scope.thirdPartyId as string | null } } : {}),
    ...(value.resource ? { resource: { type: value.resource.type as string, id: value.resource.id as string | null } } : {}),
    ...(value.beforeVersion !== undefined ? { beforeVersion: value.beforeVersion } : {}), ...(value.afterVersion !== undefined ? { afterVersion: value.afterVersion } : {}),
    ...(value.suppressed !== undefined ? { suppressed: value.suppressed as number } : {}),
  };
}

export function auditExpiresAt(occurredAt: string): Date {
  const expiration = new Date(occurredAt);
  const originalDay = expiration.getUTCDate();
  expiration.setUTCFullYear(expiration.getUTCFullYear() + 2);
  if (expiration.getUTCDate() !== originalDay) expiration.setUTCDate(0);
  return expiration;
}
