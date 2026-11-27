import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { auditHistoryHandlers } from '@/modules/audit/presentation/audit-history';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';

const actor = { subject: 'admin_1', username: null, name: null, email: null, roles: ['APP_ADMIN'], permissions: [] } as AuthenticatedActor;
const request = (query: string) => new Request(`https://example.test/api/audit${query}`);

describe('audit history HTTP handlers', () => {
  it('rejects invalid filters without authorization or querying journal documents', async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null, pageSize: 20 }));
    const auth = { requirePermission: vi.fn() } as unknown as Authorization;
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth);
    const response = await handlers.list(actor, request('?scope=global&action=INVOICE_SECRET_EXPORTED'));
    expect(response.status).toBe(400);
    expect(auth.requirePermission).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a from-only range older than two years before touching authorization or journal data', async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null, pageSize: 20 }));
    const auth = { requirePermission: vi.fn() } as unknown as Authorization;
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth);
    const from = new Date(Date.now() - 3 * 366 * 24 * 60 * 60 * 1000).toISOString();
    const response = await handlers.list(actor, request(`?scope=global&from=${encodeURIComponent(from)}`));
    expect(response.status).toBe(400);
    expect(auth.requirePermission).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('checks the global grant before reading documents', async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null, pageSize: 20 }));
    const auth = { requirePermission: vi.fn(async () => { throw new AuthorizationError(); }) } as unknown as Authorization;
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth);
    const response = await handlers.list(actor, request('?scope=global'));
    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it('adds only the actor full name from the identity directory and falls back to subject when unavailable', async () => {
    const event = { eventId:'evt_1', occurredAt:'2026-11-26T10:00:00.000Z', source:'fleet', actor:{kind:'user',subject:'admin_1'}, action:'VEHICLE_UPDATED', result:'allowed', reason:'BUSINESS_MUTATION', correlationId:'corr_1' };
    const list = vi.fn(async () => ({ items:[event], nextCursor:null, pageSize:20 }));
    const auth = { requirePermission: vi.fn(async () => undefined) } as unknown as Authorization;
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth, async () => 'Ana Gómez');
    const response = await handlers.list(actor, request('?scope=global'));
    expect((await response.json()).items[0].actor).toEqual({ kind:'user', subject:'admin_1', displayName:'Ana Gómez' });

    const unavailable = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth, async () => { throw new Error('directory down'); });
    const fallback = await unavailable.list(actor, request('?scope=global'));
    expect((await fallback.json()).items[0].actor).toEqual({ kind:'user', subject:'admin_1' });
  });

  it('resolves actor name filters to subjects before querying and does not put the search term in the read event', async () => {
    const list = vi.fn(async (_input: unknown) => ({ items: [], nextCursor: null, pageSize: 20 }));
    const auth = { requirePermission: vi.fn(async () => undefined) } as unknown as Authorization;
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth, undefined, undefined, async () => ['user_123']);
    const response = await handlers.list(actor, request('?scope=global&actor=Ana%20Gomez'));
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ actorSubjects:['user_123'] }));
    expect(JSON.stringify(list.mock.calls[0]?.[0])).not.toContain('Ana Gomez');
  });

  it('treats numeric actor subjects as exact IDs and degrades a failed directory search to exact subject matching', async () => {
    const list = vi.fn(async (_input: unknown) => ({ items: [], nextCursor: null, pageSize: 20 }));
    const auth = { requirePermission: vi.fn(async () => undefined) } as unknown as Authorization;
    const search = vi.fn(async (_text: string): Promise<readonly string[]> => { throw new Error('Identity Directory unavailable'); });
    const handlers = auditHistoryHandlers({ list, detail: vi.fn() } as never, auth, undefined, undefined, search);

    const numericIdResponse = await handlers.list(actor, request('?scope=global&actor=78787887'));
    expect(numericIdResponse.status).toBe(200);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actorSubjects:['78787887'] }));
    expect(search).not.toHaveBeenCalled();

    const nameResponse = await handlers.list(actor, request('?scope=global&actor=Ana'));
    expect(nameResponse.status).toBe(200);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actorSubjects:['Ana'] }));

    const uuidResponse = await handlers.list(actor, request('?scope=global&actor=d12b5dab-4b8c-4526-affb-0a88bf30b92e'));
    expect(uuidResponse.status).toBe(200);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ actorSubjects:['d12b5dab-4b8c-4526-affb-0a88bf30b92e'] }));
  });
});
