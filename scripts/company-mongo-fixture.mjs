import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { command, freePort } from './auth-fixture.mjs';

export async function startCompanyMongo({ replicaSet = true } = {}) {
  const name = `invoices-company-test-${randomUUID()}`;
  const port = await freePort();
  const image = 'mongo:8.0@sha256:b9924c330a8bbc5800fe9c69f04a84e221eca7b28fd049a0354147d9908fa142';
  let started = false;
  const stop = async () => { if (started) { await command('docker', ['rm', '-f', name]); started = false; } };
  try {
    await command('docker', ['run', '--detach', '--name', name, '--publish', `127.0.0.1:${port}:27017`, image,
      'mongod', '--bind_ip_all', ...(replicaSet ? ['--replSet', 'company-test'] : [])]);
    started = true;
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        await command('docker', ['exec', name, 'mongosh', '--quiet', '--eval', replicaSet
          ? "try { rs.status() } catch (e) { if (e.code === 94) rs.initiate({_id:'company-test',members:[{_id:0,host:'localhost:27017'}]}); else throw e; } quit(db.hello().isWritablePrimary ? 0 : 1)"
          : "quit(db.hello().isWritablePrimary ? 0 : 1)"]);
        break;
      } catch (error) { if (Date.now() > deadline) throw error; await delay(500); }
    }
    return { uri: `mongodb://127.0.0.1:${port}/company_fixture_test?directConnection=true${replicaSet ? '&replicaSet=company-test' : ''}`, stop };
  } catch (error) { await stop(); throw error; }
}
