import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const actor = process.env.PARAMETRIC_CATALOGS_INIT_ACTOR?.trim() || 'system:catalog-seed';
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { createCatalogRepository } = await server.ssrLoadModule('/src/modules/parametric-catalogs/infrastructure/mongodb/catalog-repository.ts');
  const { loadDivipola, baseCatalogEntries } = await server.ssrLoadModule('/src/modules/parametric-catalogs/infrastructure/divipola.ts');
  const { policyConfirmation } = await server.ssrLoadModule('/src/modules/identity/infrastructure/mongodb/policy-repository.ts');
  close = closeMongo;
  const environment = readServerEnvironment();
  const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
  const divipola = await loadDivipola();
  const allEntries = [...baseCatalogEntries, ...divipola.entries];
  const sourceHash = createHash('sha256').update(JSON.stringify({ source: divipola.sha256, entries: allEntries })).digest('hex');
  const repository = createCatalogRepository(async () => connection, policyConfirmation);
  const result = await repository.seed(allEntries, `parametric-catalogs-${divipola.version}`, sourceHash);
  console.log(JSON.stringify({ ...result, source: `DANE DIVIPOLA ${divipola.version}`, actor, countries: 1,
    departments: divipola.entries.filter(entry => entry.catalog === 'departments').length,
    territories: divipola.entries.filter(entry => entry.catalog === 'municipalities').length,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Parametric catalogs initialization failed.');
  process.exitCode = 1;
} finally {
  await close?.();
  await server.close();
}
