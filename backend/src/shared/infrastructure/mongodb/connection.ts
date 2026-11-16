import mongoose, { type Connection } from 'mongoose';

type Cache = { connection?: Connection; pending?: Promise<Connection> };
type OpenConnection = (uri: string) => Promise<Connection>;

export function createConnectionManager(open: OpenConnection, cache: Cache = {}) {
  return {
    async connect(uri: string): Promise<Connection> {
      // An established pool owns reconnection after a transient disconnect.
      if (cache.connection) return cache.connection;
      if (!cache.pending) {
        cache.pending = Promise.resolve().then(() => open(uri)).then(connection => {
          cache.connection = connection;
          cache.pending = undefined;
          return connection;
        }).catch(error => {
          cache.pending = undefined;
          cache.connection = undefined;
          throw error;
        });
      }
      return cache.pending;
    },
    async close() {
      const connection = cache.connection ?? await cache.pending;
      cache.connection = undefined;
      cache.pending = undefined;
      await connection?.close();
    },
  };
}

const state = globalThis as typeof globalThis & { invoicesMongoCache?: Cache };
state.invoicesMongoCache ??= {};
const manager = createConnectionManager(async uri => {
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000, maxPoolSize: 10 });
  try { return await connection.asPromise(); }
  catch (error) { await connection.close().catch(() => undefined); throw error; }
}, state.invoicesMongoCache);

export const connectMongo = manager.connect;
export const closeMongo = manager.close;
