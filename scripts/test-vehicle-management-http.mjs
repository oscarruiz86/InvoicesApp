import { fileURLToPath } from 'node:url';
import { command } from './auth-fixture.mjs';
import { startCompanyMongo } from './company-mongo-fixture.mjs';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm --prefix backend run test:http:prepared');
const mongo = await startCompanyMongo();
try {
  console.log(await command(process.execPath, [npm, 'run', 'test:http'], {
    cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
    env: { ...process.env, MONGODB_TEST_URI: mongo.uri },
  }));
} finally { await mongo.stop(); }
