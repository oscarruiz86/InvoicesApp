import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createMongoKeycloakAdminCursor } from '@/modules/identity/infrastructure/mongodb/keycloak-admin-cursor';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI must name an isolated _test database');
const database = `invoices_keycloak_audit_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 3000 });
beforeAll(async () => { await connection.asPromise(); });
afterAll(async () => {
  if (connection.readyState === 1 && connection.name === database && /^invoices_keycloak_audit_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase();
  await connection.close();
});

it('persists a per-realm cursor and never moves it backwards', async () => {
  const firstProcess = createMongoKeycloakAdminCursor(connection, 'invoices');
  expect(await firstProcess.load()).toBeNull();
  await firstProcess.save(1_800_000_000_000);
  const restartedProcess = createMongoKeycloakAdminCursor(connection, 'invoices');
  expect(await restartedProcess.load()).toBe(1_800_000_000_000);
  await restartedProcess.save(1_700_000_000_000);
  expect(await firstProcess.load()).toBe(1_800_000_000_000);
});
