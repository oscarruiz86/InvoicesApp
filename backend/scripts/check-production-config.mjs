import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function productionConfigErrors(source) {
  const errors = [];
  const servicesIndex = source.indexOf('services:');
  const serviceSource = servicesIndex < 0 ? '' : source.slice(servicesIndex + 'services:'.length);
  const serviceSection = /^\S[^\r\n]*:\s*$/m.exec(serviceSource)?.index;
  const body = serviceSource.slice(0, serviceSection ?? serviceSource.length);
  const matches = [...body.matchAll(/^  ([A-Za-z0-9_-]+):\s*\r?\n([\s\S]*?)(?=^  [A-Za-z0-9_-]+:|(?![\s\S]))/gm)];
  const services = new Map(matches.map(match => [match[1], match[2]]));
  if (!services.has('frontend') || !services.has('backend') || ![...services.keys()].some(name => name.endsWith('worker'))) errors.push('frontend, backend, and at least one worker service are required');
  for (const [name, block] of services) {
    for (const [field, pattern] of [
      ['read_only', /^    read_only:\s*true\s*$/m], ['cap_drop ALL', /^    cap_drop:\s*\[ALL\]\s*$/m],
      ['no-new-privileges', /no-new-privileges:true/], ['CPU limit', /^    cpus:\s*[1-9]/m],
      ['memory limit', /^    mem_limit:\s*\S+/m], ['PID limit', /^    pids_limit:\s*\d+/m],
    ]) if (!pattern.test(block)) errors.push(`${name}: missing ${field}`);
    if (/^    ports:/m.test(block)) errors.push(`${name}: host-published ports are forbidden`);
    if (/start-dev|vite --host|next dev|mongod\s+--.*(?:noauth|development)/i.test(block)) errors.push(`${name}: development runtime is forbidden`);
    if (/^\s+(?:[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|URI)):\s*(?!\/run\/secrets\/|\$\{)[^\s#][^\r\n]*/m.test(block)) errors.push(`${name}: possible inline secret`);
  }
  if (/^\s*ports:\s*\r?\n\s+-\s*["']?0\.0\.0\.0:/m.test(source)) errors.push('public data ports are forbidden');
  return errors;
}

if (process.argv.includes('--self-test')) {
  const valid = 'services:\n  frontend:\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n    cpus: 1.0\n    mem_limit: 256m\n    pids_limit: 64\n  backend:\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n    cpus: 1.0\n    mem_limit: 256m\n    pids_limit: 64\n  task-worker:\n    read_only: true\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n    cpus: 1.0\n    mem_limit: 256m\n    pids_limit: 64\n';
  assert.deepEqual(productionConfigErrors(valid), []);
  assert(productionConfigErrors(valid.replace('    ports:', '    ports:').replace('pids_limit: 64', 'pids_limit: 64\n    ports:\n      - "0.0.0.0:27017:27017"')).length > 0);
  assert(productionConfigErrors(valid.replace('    read_only: true', '    read_only: false')).length > 0);
  assert(productionConfigErrors(valid.replace('pids_limit: 64', 'pids_limit: 64\n    environment:\n      MONGODB_URI: mongodb://user:pass@host/db')).length > 0);
  console.log('Production configuration checker self-test passed.');
} else {
  const file = resolve(process.cwd(), '..', 'compose.production.yaml');
  const errors = productionConfigErrors(await readFile(file, 'utf8'));
  if (errors.length) { for (const error of errors) console.error(`ERROR ${error}`); process.exitCode = 1; }
  else console.log('Production Compose baseline passed static security checks.');
}
