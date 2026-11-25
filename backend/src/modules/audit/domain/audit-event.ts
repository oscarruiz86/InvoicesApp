export type AuditEventSource = 'authorization' | 'organizations' | 'keycloak-admin';
export type AuditActorKind = 'user' | 'service' | 'system';
export type AuditResult = 'allowed' | 'denied';

export interface AuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly source: AuditEventSource;
  readonly actor: { readonly kind: AuditActorKind; readonly subject: string };
  readonly action: string;
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

export function normalizeAuditEvent(value: unknown): AuditEvent {
  if (!record(value) || !keysAre(value, ['eventId', 'occurredAt', 'source', 'actor', 'action', 'result', 'reason', 'correlationId', 'scope', 'resource', 'beforeVersion', 'afterVersion', 'suppressed'])) throw new InvalidAuditEvent();
  if (!text(value.eventId, 128, /^[A-Za-z0-9_:@-]+$/u) || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt)) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value.occurredAt)
      || !['authorization', 'organizations', 'keycloak-admin'].includes(String(value.source)) || !record(value.actor)
      || !keysAre(value.actor, ['kind', 'subject']) || !['user', 'service', 'system'].includes(String(value.actor.kind))
      || !text(value.actor.subject, 128, /^[A-Za-z0-9_:@-]+$/u) || !text(value.action, 96, /^[A-Z][A-Z0-9_:-]*$/u)
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
