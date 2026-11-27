export const auditSources = ['authorization', 'organizations', 'keycloak-admin', 'fleet', 'invoices', 'invoice-sync', 'configuration', 'parametric-catalogs', 'audit'] as const;
export type AuditSource = typeof auditSources[number];
export interface AuditHistoryEvent { readonly eventId: string; readonly occurredAt: string; readonly source: AuditSource; readonly actor: { readonly kind: 'user'|'service'|'system'; readonly subject: string; readonly displayName?: string };
  readonly action: string; readonly result: 'allowed'|'denied'; readonly reason: string; readonly correlationId: string;
  readonly scope?: { readonly companyId: string|null; readonly thirdPartyId: string|null }; readonly resource?: { readonly type: string; readonly id: string|null };
  readonly displayNames?: { readonly company?: string; readonly thirdParty?: string; readonly resource?: string };
  readonly beforeVersion?: string; readonly afterVersion?: string; readonly suppressed?: number }
export interface AuditHistoryFilters { readonly from?: string; readonly to?: string; readonly source?: AuditSource; readonly action?: string; readonly result?: 'allowed'|'denied'; readonly actor?: string }
export interface AuditHistoryPage { readonly items: readonly AuditHistoryEvent[]; readonly nextCursor: string|null; readonly pageSize: number }
export interface AuditHistoryReadPort { list(filters: AuditHistoryFilters, pageSize: number, cursor?: string, signal?: AbortSignal): Promise<AuditHistoryPage>; get(eventId: string, signal?: AbortSignal): Promise<AuditHistoryEvent> }
const eventKeys = ['eventId','occurredAt','source','actor','action','result','reason','correlationId','scope','resource','displayNames','beforeVersion','afterVersion','suppressed'];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function parseEvent(value: unknown): AuditHistoryEvent {
  if (!record(value) || Object.keys(value).some(key => !eventKeys.includes(key)) || !['eventId','occurredAt','source','actor','action','result','reason','correlationId'].every(key => key in value)) throw new Error('Invalid audit event.');
  const actor = value.actor;
  if (typeof value.eventId !== 'string' || !/^[A-Za-z0-9_:@-]{1,128}$/.test(value.eventId) || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))
    || !auditSources.includes(value.source as AuditSource) || !record(actor) || Object.keys(actor).some(key=>!['kind','subject','displayName'].includes(key)) || !['user','service','system'].includes(String(actor.kind)) || typeof actor.subject !== 'string'
    || !/^[A-Za-z0-9_:-]{1,128}$/.test(actor.subject) || typeof value.action !== 'string' || !/^[A-Z][A-Z0-9_:-]{0,95}$/.test(value.action)
    || !['allowed','denied'].includes(String(value.result)) || typeof value.reason !== 'string' || !/^[A-Z][A-Z0-9_:-]{0,63}$/.test(value.reason)
    || typeof value.correlationId !== 'string' || !/^[A-Za-z0-9_:@-]{1,128}$/.test(value.correlationId)) throw new Error('Invalid audit event.');
  if (actor.displayName !== undefined && (typeof actor.displayName !== 'string' || actor.displayName.length > 120 || actor.displayName.trim() !== actor.displayName
    || [...actor.displayName].some(character => { const code = character.codePointAt(0)!; return code <= 31 || code === 127; }))) throw new Error('Invalid audit actor name.');
  if (value.scope !== undefined && (!record(value.scope) || Object.keys(value.scope).some(key => !['companyId','thirdPartyId'].includes(key))
    || !(value.scope.companyId === null || typeof value.scope.companyId === 'string') || !(value.scope.thirdPartyId === null || typeof value.scope.thirdPartyId === 'string'))) throw new Error('Invalid audit scope.');
  if (value.resource !== undefined && (!record(value.resource) || Object.keys(value.resource).some(key => !['type','id'].includes(key)) || typeof value.resource.type !== 'string'
    || !(value.resource.id === null || typeof value.resource.id === 'string'))) throw new Error('Invalid audit resource.');
  if (value.displayNames !== undefined && (!record(value.displayNames) || Object.keys(value.displayNames).some(key => !['company','thirdParty','resource'].includes(key))
    || Object.values(value.displayNames).some(name => typeof name !== 'string' || name.length > 256))) throw new Error('Invalid audit display names.');
  if (value.beforeVersion !== undefined && typeof value.beforeVersion !== 'string' || value.afterVersion !== undefined && typeof value.afterVersion !== 'string'
    || value.suppressed !== undefined && (!Number.isSafeInteger(value.suppressed) || Number(value.suppressed) < 0)) throw new Error('Invalid audit metadata.');
  return value as unknown as AuditHistoryEvent;
}
function parsePage(value: unknown): AuditHistoryPage {
  if (!record(value) || Object.keys(value).sort().join(',') !== ['items','nextCursor','pageSize'].sort().join(',') || !Array.isArray(value.items)
    || typeof value.pageSize !== 'number' || !Number.isInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 100
    || !(value.nextCursor === null || typeof value.nextCursor === 'string' && value.nextCursor.length <= 1024) || value.items.length > value.pageSize) throw new Error('Invalid audit page.');
  return { items: value.items.map(parseEvent), nextCursor: value.nextCursor, pageSize: value.pageSize };
}
export function createAuditHistoryApi(http: { audit(method: 'GET', path: string, query: string, signal?: AbortSignal): Promise<unknown> }): AuditHistoryReadPort {
  return {
    async list(filters, pageSize, cursor, signal) {
      const params = new URLSearchParams({ scope: 'global', pageSize: String(pageSize) });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      if (cursor) params.set('cursor', cursor);
      return parsePage(await http.audit('GET', 'audit', params.toString(), signal));
    },
    async get(eventId, signal) {
      if (!/^[A-Za-z0-9_:@-]{1,128}$/.test(eventId)) throw new Error('Invalid event id.');
      return parseEvent(await http.audit('GET', `audit/${encodeURIComponent(eventId)}`, 'scope=global', signal));
    },
  };
}
