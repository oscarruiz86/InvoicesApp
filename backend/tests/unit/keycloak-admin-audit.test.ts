import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createKeycloakAdminEventCollector, mapKeycloakAdminEvent } from '@/modules/identity/infrastructure/keycloak/admin-event-collector';

describe('Keycloak administrative audit mapping', () => {
  const providerEvent = {
    id: 'event-01', time: 1_800_000_000_000, operationType: 'UPDATE', resourceType: 'USER', resourcePath: 'users/user-12',
    authDetails: { userId: 'admin-3', clientId: 'admin-cli', ipAddress: '192.0.2.1' },
    representation: '{"password":"secret"}', details: { username: 'private-name', token: 'secret-token' },
  };

  it('maps stable identity and approved facts while dropping provider details', () => {
    const mapped = mapKeycloakAdminEvent(providerEvent, 'invoices');
    expect(mapped).toEqual({
      eventId: 'keycloak-admin:invoices:event-01', occurredAt: new Date(providerEvent.time).toISOString(), source: 'keycloak-admin',
      actor: { kind: 'user', subject: 'admin-3' }, action: 'KEYCLOAK_ADMIN_UPDATE_USER', result: 'allowed',
      reason: 'KEYCLOAK_ADMIN', correlationId: 'keycloak-admin:invoices:event-01',
      resource: { type: 'keycloak-user', id: 'user-12' },
    });
    expect(JSON.stringify(mapped)).not.toMatch(/secret|token|192\.0\.2\.1|private-name/);
    expect(mapKeycloakAdminEvent({ ...providerEvent, error: 'FORBIDDEN' }, 'invoices').result).toBe('denied');
  });

  it('uses a service actor only when the provider identifies the client', () => {
    expect(mapKeycloakAdminEvent({ ...providerEvent, authDetails: { clientId: 'invoices-audit-reader' } }, 'invoices').actor)
      .toEqual({ kind: 'service', subject: 'invoices-audit-reader' });
    expect(() => mapKeycloakAdminEvent({ ...providerEvent, authDetails: null }, 'invoices')).toThrow('KEYCLOAK_ADMIN_EVENT_ACTOR_MISSING');
    expect(() => mapKeycloakAdminEvent({ ...providerEvent, time: 'yesterday' }, 'invoices')).toThrow('KEYCLOAK_ADMIN_EVENT_INVALID');
  });

  it('only advances an overlapping durable cursor after every page is delivered', async () => {
    const events = [0, 1, 2].map(index => ({ ...providerEvent, id: `event-${index}`, time: 5_000 + index }));
    const pages = vi.fn(async ({ first }: { from: number; to: number; first: number; max: number }) => events.slice(first, first + 2));
    const load = vi.fn(async () => 5_000); const save = vi.fn(async () => undefined);
    const deliveredEvents: { eventId: string }[] = [];
    const record = async (event: { eventId: string }) => { deliveredEvents.push(event); };
    const collector = createKeycloakAdminEventCollector({ realm: 'invoices', source: { page: pages }, cursor: { load, save },
      audit: { record }, now: () => 10_000, pageSize: 2, overlapMs: 500 });

    expect(await collector.pollOnce()).toBe(3);
    expect(pages.mock.calls.map(([query]) => query)).toEqual([
      { from: 4_500, to: 10_000, first: 0, max: 2 }, { from: 4_500, to: 10_000, first: 2, max: 2 },
    ]);
    expect(deliveredEvents.map(event => event.eventId)).toEqual(events.map(event => `keycloak-admin:invoices:${event.id}`));
    expect(save).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledWith(10_000);
  });

  it('keeps the cursor unchanged when the Audit writer rejects a provider event', async () => {
    const save = vi.fn(async () => undefined);
    const collector = createKeycloakAdminEventCollector({ realm: 'invoices', source: { page: async () => [providerEvent] },
      cursor: { load: async () => null, save }, audit: { record: async () => { throw new Error('sink unavailable'); } }, now: () => 10_000 });
    await expect(collector.pollOnce()).rejects.toThrow('sink unavailable');
    expect(save).not.toHaveBeenCalled();
  });

  it('replays an interrupted window with the same provider-derived event identity', async () => {
    let accepted = false;
    const ids: string[] = [];
    const save = vi.fn(async () => undefined);
    const collector = createKeycloakAdminEventCollector({ realm: 'invoices', source: { page: async () => [providerEvent] },
      cursor: { load: async () => null, save }, audit: { record: async event => { ids.push(event.eventId); if (!accepted) throw new Error('interrupted'); } }, now: () => 10_000 });
    await expect(collector.pollOnce()).rejects.toThrow('interrupted');
    accepted = true;
    await expect(collector.pollOnce()).resolves.toBe(1);
    expect(ids).toEqual(['keycloak-admin:invoices:event-01', 'keycloak-admin:invoices:event-01']);
    expect(save).toHaveBeenCalledOnce();
  });

  it('enables detailed-event-free capture only in the local imported realm', async () => {
    const realm = JSON.parse(await readFile(new URL('../../../keycloak/invoices-realm.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(realm.adminEventsEnabled).toBe(true);
    expect(realm.adminEventsDetailsEnabled).toBe(false);
  });
});
