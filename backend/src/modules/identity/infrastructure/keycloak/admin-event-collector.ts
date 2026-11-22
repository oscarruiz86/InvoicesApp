/** Minimal structural contract shared with the Audit module without importing its storage adapter. */
export type KeycloakAdminAuditEvent = Readonly<{
  eventId: string; occurredAt: string; source: 'keycloak-admin'; actor: { kind: 'user' | 'service'; subject: string };
  action: string; result: 'allowed' | 'denied'; reason: string; correlationId: string;
  resource?: { type: string; id: string | null };
}>;
export type KeycloakAdminEvent = Readonly<{
  id?: unknown; time?: unknown; operationType?: unknown; resourceType?: unknown; resourcePath?: unknown;
  authDetails?: { userId?: unknown; clientId?: unknown } | null;
  representation?: unknown; details?: unknown; error?: unknown; [key: string]: unknown;
}>;
export type KeycloakAdminAuditWriter = { record(event: KeycloakAdminAuditEvent): Promise<void> };

const identifier = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const label = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const safe = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return safe || fallback;
};

export function mapKeycloakAdminEvent(input: KeycloakAdminEvent, realm: string): KeycloakAdminAuditEvent {
  if (!input || typeof input !== 'object' || typeof input.id !== 'string' || !identifier.test(input.id)
    || typeof input.time !== 'number' || !Number.isSafeInteger(input.time) || input.time < 0 || !Number.isFinite(new Date(input.time).getTime())) throw new Error('KEYCLOAK_ADMIN_EVENT_INVALID');
  if (!identifier.test(realm)) throw new Error('KEYCLOAK_ADMIN_REALM_INVALID');
  const actorUser = input.authDetails?.userId;
  const actorClient = input.authDetails?.clientId;
  const actorSubject = typeof actorUser === 'string' ? (identifier.test(actorUser) ? actorUser : null)
    : typeof actorClient === 'string' && identifier.test(actorClient) ? actorClient : null;
  if (!actorSubject) throw new Error('KEYCLOAK_ADMIN_EVENT_ACTOR_MISSING');
  const eventId = `keycloak-admin:${realm}:${input.id}`;
  if (!identifier.test(eventId)) throw new Error('KEYCLOAK_ADMIN_EVENT_ID_INVALID');
  const type = label(input.resourceType, 'ADMIN_RESOURCE');
  const path = typeof input.resourcePath === 'string' ? input.resourcePath.split('/').filter(Boolean).at(-1) : undefined;
  const resourceId = path && identifier.test(path) ? path : null;
  const occurredAt = new Date(input.time).toISOString();
  return {
    eventId, occurredAt, source: 'keycloak-admin', actor: { kind: typeof actorUser === 'string' ? 'user' : 'service', subject: actorSubject },
    action: `KEYCLOAK_ADMIN_${label(input.operationType, 'OPERATION')}_${type}`, result: input.error ? 'denied' : 'allowed',
    reason: input.error ? 'KEYCLOAK_ADMIN_ERROR' : 'KEYCLOAK_ADMIN', correlationId: eventId,
    resource: { type: `keycloak-${type.toLowerCase().replace(/_/g, '-')}`, id: resourceId },
  };
}

export type KeycloakAdminEventSource = { page(input: { from: number; to: number; first: number; max: number }): Promise<readonly KeycloakAdminEvent[]> };
export type KeycloakAdminCursor = { load(): Promise<number | null>; save(value: number): Promise<void> };

export function createKeycloakAdminEventCollector(input: {
  realm: string; source: KeycloakAdminEventSource; cursor: KeycloakAdminCursor; audit: KeycloakAdminAuditWriter;
  now?: () => number; pageSize?: number; overlapMs?: number; initialLookbackMs?: number;
}) {
  const pageSize = input.pageSize ?? 100; const overlapMs = input.overlapMs ?? 60_000;
  const initialLookbackMs = input.initialLookbackMs ?? 86_400_000; const now = input.now ?? Date.now;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('KEYCLOAK_ADMIN_PAGE_SIZE_INVALID');
  return { async pollOnce(): Promise<number> {
    const capturedTo = now();
    const prior = await input.cursor.load();
    const from = Math.max(0, (prior ?? Math.max(0, capturedTo - initialLookbackMs)) - overlapMs);
    let first = 0; let delivered = 0;
    while (true) {
      const events = await input.source.page({ from, to: capturedTo, first, max: pageSize });
      for (const event of events) { await input.audit.record(mapKeycloakAdminEvent(event, input.realm)); delivered++; }
      if (events.length < pageSize) break;
      first += events.length;
    }
    await input.cursor.save(capturedTo);
    return delivered;
  } };
}
