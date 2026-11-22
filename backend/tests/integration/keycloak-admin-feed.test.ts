import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createKeycloakAdminEventCollector } from '@/modules/identity/infrastructure/keycloak/admin-event-collector';
import { createKeycloakAdminEventApi } from '@/modules/identity/infrastructure/keycloak/admin-event-api';
import { createMongoKeycloakAdminCursor } from '@/modules/identity/infrastructure/mongodb/keycloak-admin-cursor';

const uri = process.env.MONGODB_TEST_URI;
const baseUrl = process.env.KEYCLOAK_ADMIN_AUDIT_BASE_URL;
const realm = process.env.KEYCLOAK_ADMIN_AUDIT_REALM;
const clientId = process.env.KEYCLOAK_ADMIN_AUDIT_CLIENT_ID;
const clientSecret = process.env.KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
if (!baseUrl || !realm || !clientId || !clientSecret) throw new Error('Disposable Keycloak administrative audit fixture is required');
const database = `invoices_keycloak_feed_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });
beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_keycloak_feed_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('reads the real disposable Keycloak feed and replays overlap using stable IDs', async () => {
  const seen = new Map<string, string>();
  const api = createKeycloakAdminEventApi({ baseUrl, realm, clientId, clientSecret });
  const cursor = createMongoKeycloakAdminCursor(connection, realm);
  const collector = createKeycloakAdminEventCollector({ realm, source: api, cursor, now: Date.now,
    audit: { async record(event) {
      expect(event.source).toBe('keycloak-admin');
      const canonical = JSON.stringify(event);
      const previous = seen.get(event.eventId);
      if (previous !== undefined) expect(previous).toBe(canonical);
      seen.set(event.eventId, canonical);
    } },
  });

  expect(await collector.pollOnce()).toBeGreaterThan(0);
  const firstCursor = await cursor.load();
  expect(firstCursor).toBeTypeOf('number');
  expect(seen.size).toBeGreaterThan(0);
  expect(await collector.pollOnce()).toBeGreaterThan(0);
  expect(await cursor.load()).toBeGreaterThanOrEqual(firstCursor!);
});
