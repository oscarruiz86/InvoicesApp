import { createServer } from 'vite';
import { resolve } from 'node:path';
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { randomUUID } = await import('node:crypto');
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { inspectAssignmentMigration, applyAssignmentMigration, rollbackAssignmentMigration } = await server.ssrLoadModule('/src/modules/fleet/infrastructure/mongodb/assignment-migration.ts');
  close = closeMongo;
  const environment = readServerEnvironment();
  const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
  const args = process.argv.slice(2);
  if (args[0] === '--apply') {
    const migrationId = args[1] ?? randomUUID();
    const result = await applyAssignmentMigration(connection, migrationId);
    console.log(JSON.stringify(result, null, 2));
  } else if (args[0] === '--rollback') {
    if (!args[1]) throw new Error('ASSIGNMENT_MIGRATION_ID_REQUIRED');
    console.log(JSON.stringify(await rollbackAssignmentMigration(connection, args[1]), null, 2));
  } else if (args.length) throw new Error('INVALID_ASSIGNMENT_MIGRATION_COMMAND');
  else console.log(JSON.stringify(await inspectAssignmentMigration(connection), null, 2));
} catch {
  console.error('Assignment inventory/migration failed. Check database configuration and migration state.');
  process.exitCode = 1;
} finally {
  await close?.();
  await server.close();
}
