import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { inspectLegacyMemberships, migrateLegacyMemberships } = await server.ssrLoadModule('/src/modules/organizations/infrastructure/mongodb/legacy-membership-migration.ts');
  close = closeMongo;
  const environment = readServerEnvironment();
  const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
  const result = process.argv.includes('--apply') ? await migrateLegacyMemberships(connection) : await inspectLegacyMemberships(connection);
  const { groups, organizations, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
  if ('ready' in result && !result.ready) process.exitCode = 2;
} catch {
  console.error('Legacy membership inventory/migration failed. Check database and configuration.');
  process.exitCode = 1;
} finally {
  await close?.();
  await server.close();
}
