import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default function cleanOfflineShellE2eEnvironment() {
  try { unlinkSync(fileURLToPath(new URL('../../test-results/offline-shell-e2e-key.json', import.meta.url))); }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
}
