import { afterAll, expect, it } from 'vitest';
import { connectMongo, closeMongo } from '@/shared/infrastructure/mongodb/connection';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('MONGODB_TEST_URI debe indicar una base aislada terminada en _test');
afterAll(closeMongo);
it('connects, reuses a real pool, and recovers from a rejected attempt', async () => {
  const connection = await connectMongo(uri);
  expect(await connectMongo(uri)).toBe(connection);
  expect(await connection.db!.admin().ping()).toMatchObject({ ok: 1 });
  await closeMongo();
  await expect(connectMongo('mongodb://127.0.0.1:1/unavailable_test')).rejects.toThrow();
  expect((await connectMongo(uri)).readyState).toBe(1);
});
