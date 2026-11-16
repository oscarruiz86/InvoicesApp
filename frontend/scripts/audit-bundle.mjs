import fs from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve(import.meta.dirname, '../dist');
async function audit(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) { await audit(file); continue; }
    if (!/\.(js|html|css)$/.test(entry.name)) continue;
    const contents = await fs.readFile(file, 'utf8');
    if (/mongodb(?:\+srv)?:\/\/|KEYCLOAK_|http:\/\/(backend|mongodb):/.test(contents)) throw new Error('Private server configuration found in public bundle: ' + entry.name);
  }
}
await audit(directory);
console.log('Public bundle audit passed.');
