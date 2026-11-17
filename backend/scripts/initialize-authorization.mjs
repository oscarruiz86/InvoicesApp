import { createServer } from 'vite';
import { resolve } from 'node:path';

// Uses the already installed TypeScript module loader; no HTTP listener or new dependency.
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  close = closeMongo;
  const { createPolicyRepository } = await server.ssrLoadModule('/src/modules/identity/infrastructure/mongodb/policy-repository.ts');
  const environment = readServerEnvironment();
  const policy = await createPolicyRepository(() => connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE })).initialize();
  console.log(`Authorization policy ready; revision ${policy.version}. Existing revisions are preserved.`);
} catch { console.error('Authorization initialization failed. Check database and configuration.'); process.exitCode = 1; }
finally { await close?.(); await server.close(); }
