import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createKeycloakAdminEventCollector } from '@/modules/identity/infrastructure/keycloak/admin-event-collector';
import { createKeycloakAdminEventApi } from '@/modules/identity/infrastructure/keycloak/admin-event-api';
import { createMongoKeycloakAdminCursor } from '@/modules/identity/infrastructure/mongodb/keycloak-admin-cursor';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

const uri = process.env.MONGODB_TEST_URI;
const baseUrl = process.env.KEYCLOAK_ADMIN_AUDIT_BASE_URL;
const realm = process.env.KEYCLOAK_ADMIN_AUDIT_REALM;
const clientId = process.env.KEYCLOAK_ADMIN_AUDIT_CLIENT_ID;
const clientSecretFile = process.env.KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
if (!baseUrl || !realm || !clientId || !clientSecretFile) throw new Error('Disposable Keycloak administrative audit fixture is required');
const database = `invoices_keycloak_feed_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });
let clientSecret = '';
beforeAll(async () => { clientSecret = (await readFile(clientSecretFile, 'utf8')).trim(); if (!clientSecret) throw new Error('Disposable Keycloak administrative audit secret file is empty'); await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_keycloak_feed_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('writes real disposable Keycloak events to Audit and replays overlap idempotently', async () => {
  const api = createKeycloakAdminEventApi({ baseUrl, realm, clientId, clientSecret });
  const cursor = createMongoKeycloakAdminCursor(connection, realm);
  const capturedTo = Date.now();
  const createCollector = () => createKeycloakAdminEventCollector({ realm, source: api, cursor, now: () => capturedTo, overlapMs: 86_400_000, audit: createMongoAuditWriter(connection) });

  expect(await createCollector().pollOnce()).toBeGreaterThan(0);
  const firstCursor = await cursor.load();
  expect(firstCursor).toBeTypeOf('number');
  const stored = await connection.collection('audit_events').find({ source: 'keycloak-admin' }).toArray();
  expect(stored.length).toBeGreaterThan(0);
  expect(stored.every(event => typeof event._id === 'string' && event.occurredAt instanceof Date)).toBe(true);
  for (const event of stored) {
    expect(event).not.toHaveProperty('representation');
    expect(event).not.toHaveProperty('details');
    expect(event).not.toHaveProperty('ipAddress');
  }
  // A fresh collector instance simulates a worker restart with the durable cursor intact.
  expect(await createCollector().pollOnce()).toBeGreaterThan(0);
  expect(await cursor.load()).toBeGreaterThanOrEqual(firstCursor!);
  expect(await connection.collection('audit_events').countDocuments({ source: 'keycloak-admin' })).toBe(stored.length);
});
