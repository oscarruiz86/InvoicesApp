import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const actor = process.env.PARAMETERS_INIT_ACTOR?.trim();
if (!actor) { console.error('Configura PARAMETERS_INIT_ACTOR con un actor técnico identificable.'); process.exitCode = 2; }
else {
  const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
  let close;
  try {
    const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
    const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
    const { inventoryParameters } = await server.ssrLoadModule('/src/modules/configuration/infrastructure/mongodb/parameter-repository.ts');
    const { parameterCatalog } = await server.ssrLoadModule('/src/modules/configuration/domain/parameters.ts');
    close = closeMongo;
    const environment = readServerEnvironment();
    const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
    const inventory = await inventoryParameters(connection);
    if (!inventory.ready) throw new Error('Inventario incompatible; no se aplicaron cambios. Ejecuta parameters:inventory y resuelve los hallazgos.');
    await Promise.all([
      connection.collection('functional_parameters').createIndex({ scope: 1, key: 1 }, { unique: true, name: 'functional_parameters_scope_key_unique' }),
      connection.collection('configuration_events').createIndex({ eventId: 1 }, { unique: true, name: 'configuration_events_event_id_unique' }),
      connection.collection('configuration_events').createIndex({ key: 1, at: -1, eventId: -1 }, { name: 'configuration_events_timeline' }),
    ]);
    const hello = await connection.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('parameters:init requiere replica set o mongos para transacciones.');
    const session = await connection.startSession();
    let initialized = false;
    try {
      await session.withTransaction(async () => {
        const key = Object.keys(parameterCatalog)[0];
        if (await connection.collection('functional_parameters').findOne({ key, scope: 'global' }, { session })) return;
        const now = new Date(); const value = parameterCatalog[key].initialValue;
        await connection.collection('functional_parameters').insertOne({ key, scope: 'global', value, version: 1, mutationFence: 0,
          effectiveFrom: now, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor }, { session });
        await connection.collection('configuration_events').insertOne({ eventId: randomUUID(), correlationId: randomUUID(), key, actor,
          at: now, previousValue: value, value, previousVersion: 0, version: 1 }, { session });
        initialized = true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true } });
    } finally { await session.endSession(); }
    console.log(initialized ? 'Parámetro inicializado con versión 1.' : 'Sin cambios: el parámetro ya estaba inicializado.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Parameters initialization failed.');
    process.exitCode = 1;
  } finally { await close?.(); await server.close(); }
}
