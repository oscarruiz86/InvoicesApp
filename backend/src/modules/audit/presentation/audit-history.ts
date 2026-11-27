import { randomUUID } from 'node:crypto';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { createAuditHistoryQueries } from '../application/audit-history';
import { AuditHistoryInvalid, AuditHistoryNotFound } from '../application/audit-history';
import { AuditUnavailable } from '../application/audit-ports';
import { isAllowedAuditAction, type AuditEventSource } from '../domain/audit-event';
import { errorResponse } from '@/shared/presentation/http/errors';

type Queries = ReturnType<typeof createAuditHistoryQueries>;
const sources: AuditEventSource[] = ['authorization', 'organizations', 'keycloak-admin', 'fleet', 'invoices', 'invoice-sync', 'configuration', 'parametric-catalogs', 'audit'];
const bad = () => Response.json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => Response.json({ error: { code: 'AUDIT_UNAVAILABLE', message: 'No fue posible completar la consulta.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
function readQuery(request: Request, keys: readonly string[]) {
  const query = new URL(request.url).searchParams;
  if ([...query.keys()].some(key => !keys.includes(key) || query.getAll(key).length !== 1)) return null;
  const result: Record<string, string> = {};
  for (const key of keys) { const value = query.get(key); if (value !== null) result[key] = value; }
  return result;
}
const utc = (value: string | undefined) => value !== undefined && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function listInput(request: Request, now = new Date()) {
  const raw = readQuery(request, ['scope', 'from', 'to', 'source', 'action', 'result', 'actor', 'pageSize', 'cursor']);
  if (!raw || raw.scope !== 'global') return null;
  if (raw.from && !utc(raw.from) || raw.to && !utc(raw.to)) return null;
  if (raw.from && raw.to && Date.parse(raw.from) > Date.parse(raw.to)) return null;
  if (raw.from && raw.to) { const max = new Date(raw.from); max.setUTCFullYear(max.getUTCFullYear() + 2); if (Date.parse(raw.to) > max.getTime()) return null; }
  if (raw.from && !raw.to) { const earliest = new Date(now); earliest.setUTCFullYear(earliest.getUTCFullYear() - 2); if (Date.parse(raw.from) < earliest.getTime()) return null; }
  if (raw.source && !sources.includes(raw.source as AuditEventSource)) return null;
  if (raw.action && !/^[A-Z][A-Z0-9_:-]{0,95}$/u.test(raw.action)) return null;
  if (raw.action && (raw.source ? !isAllowedAuditAction(raw.source as AuditEventSource, raw.action) : !sources.some(source => isAllowedAuditAction(source, raw.action!)))) return null;
  if (raw.result && !['allowed', 'denied'].includes(raw.result)) return null;
  if (raw.actor && (raw.actor.length > 120 || /[\u0000-\u001f]/u.test(raw.actor))) return null;
  const pageSize = raw.pageSize === undefined ? 20 : Number(raw.pageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  if (raw.cursor && (raw.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/u.test(raw.cursor))) return null;
  return { ...(raw.from ? { from: raw.from } : {}), ...(raw.to ? { to: raw.to } : {}), ...(raw.source ? { source: raw.source as AuditEventSource } : {}),
    ...(raw.action ? { action: raw.action } : {}), ...(raw.result ? { result: raw.result as 'allowed' | 'denied' } : {}), ...(raw.actor ? { actor: raw.actor } : {}), pageSize, ...(raw.cursor ? { cursor: raw.cursor } : {}) };
}
function response(error: unknown) {
  if (error instanceof AuditHistoryInvalid) return bad();
  if (error instanceof AuditHistoryNotFound) return Response.json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'El evento no está disponible.' } }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof AuditUnavailable) return unavailable();
  if (error instanceof AuthorizationError) return errorResponse(error);
  return errorResponse(error);
}
export function auditHistoryHandlers(queries: Queries, auth: Authorization, displayName?: (subject: string) => Promise<string | null>, displayEntityNames?: (event: import('../application/audit-history').SafeAuditEvent) => Promise<import('../application/audit-history').SafeAuditEvent>, searchActors?: (text: string) => Promise<readonly string[]>) {
  const scope = { kind: 'global', companyId: null, thirdPartyId: null } as const;
  const authorize = (actor: AuthenticatedActor) => auth.requirePermission(actor, 'audit:read', scope);
  const withDisplayName = async <T extends import('../application/audit-history').SafeAuditEvent>(event: T): Promise<T> => {
    if (!displayName || event.actor.kind !== 'user') return event;
    try { const name = await displayName(event.actor.subject); return name ? { ...event, actor: { ...event.actor, displayName: name } } : event; }
    catch { return event; }
  };
  const withDisplayNames = async <T extends import('../application/audit-history').SafeAuditEvent>(events: readonly T[]): Promise<T[]> => {
    const result: T[] = [];
    for (let offset = 0; offset < events.length; offset += 8) result.push(...await Promise.all(events.slice(offset, offset + 8).map(withDisplayName)));
    return result;
  };
  return {
    async list(actor: AuthenticatedActor, request: Request) {
      try {
        const input = listInput(request); if (!input) return bad();
        await authorize(actor);
        const { actor: actorFilter, ...queryInput } = input;
        let actorSubjects: readonly string[] | undefined;
        if (actorFilter) {
          const subjectLike = /^[A-Za-z0-9_:@-]{1,128}$/u.test(actorFilter) && /\d/u.test(actorFilter);
          if (subjectLike) actorSubjects = [actorFilter];
          else {
            try { actorSubjects = await searchActors?.(actorFilter) ?? []; }
            catch { actorSubjects = /^[A-Za-z0-9_:@-]{1,128}$/u.test(actorFilter) ? [actorFilter] : []; }
          }
        }
        const page = await queries.list({ ...queryInput, ...(actorSubjects ? { actorSubjects } : {}), actorSubject: actor.subject, correlationId: randomUUID() });
        return Response.json({ ...page, items: await withDisplayNames(page.items) }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return response(error); }
    },
    async detail(actor: AuthenticatedActor, request: Request, eventId: string) {
      try {
        const query = readQuery(request, ['scope']);
        if (!query || query.scope !== 'global' || !/^[A-Za-z0-9_:@-]{1,128}$/u.test(eventId)) return bad();
        await authorize(actor);
        const event = await withDisplayName(await queries.detail(eventId, actor.subject, randomUUID()));
        return Response.json(displayEntityNames ? await displayEntityNames(event) : event, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return response(error); }
    },
  };
}
