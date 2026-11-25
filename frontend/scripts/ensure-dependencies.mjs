import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const modulesRoot = path.join(frontendRoot, 'node_modules');
const markerPath = path.join(modulesRoot, '.codex-package-lock-sha256');
const lockfile = await readFile(path.join(frontendRoot, 'package-lock.json'));
const lockHash = createHash('sha256').update(lockfile).digest('hex');
let installedHash = '';

try { installedHash = await readFile(markerPath, 'utf8'); } catch { /* A fresh or old named volume has no marker. */ }

if (installedHash.trim() !== lockHash) {
  const install = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: frontendRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
  await writeFile(markerPath, lockHash, 'utf8');
}

const devServer = spawn('npm', ['run', 'dev'], {
  cwd: frontendRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => devServer.kill(signal));
}
devServer.on('error', error => { throw error; });
devServer.on('exit', (code, signal) => process.exit(code ?? (signal === 'SIGINT' ? 130 : 143)));
