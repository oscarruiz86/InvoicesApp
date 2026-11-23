import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { createLocalInvoiceImageStorage } = await server.ssrLoadModule('/src/modules/invoices/infrastructure/images/local-image-storage.ts');
  const env = readServerEnvironment();
  if (!env.INVOICE_IMAGE_STORAGE_LOCAL_ROOT) throw new Error('Invoice image storage is not configured');
  close = closeMongo;
  const connection = await connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE });
  const refs = await connection.collection('invoice_images').find({ provider: 'local', schemaVersion: 1 }, { projection: { key: 1, _id: 0 } }).toArray();
  const keys = new Set(refs.map(value => String(value.key)));
  const recovered = await createLocalInvoiceImageStorage(env.INVOICE_IMAGE_STORAGE_LOCAL_ROOT).recover(async reference => keys.has(reference.key));
  console.log(JSON.stringify({ recoveredOperations: recovered }));
} catch {
  console.error('Invoice image recovery failed. Check database and storage configuration.');
  process.exitCode = 1;
} finally { await close?.(); await server.close(); }
