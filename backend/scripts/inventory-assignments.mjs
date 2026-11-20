import { createServer } from 'vite';
import { resolve } from 'node:path';
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { inventoryAssignments } = await server.ssrLoadModule('/src/modules/fleet/infrastructure/mongodb/assignment-inventory.ts');
  close = closeMongo;
  const env = readServerEnvironment();
  const connection = await connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE });
  const result = await inventoryAssignments(connection);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 2;
} catch { console.error('Assignment inventory failed. Check database and configuration.'); process.exitCode = 1; }
finally { await close?.(); await server.close(); }
