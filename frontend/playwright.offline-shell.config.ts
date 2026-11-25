import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const keyFile = fileURLToPath(new URL('./test-results/offline-shell-e2e-key.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('./test-results/', import.meta.url)), { recursive: true });
if (!existsSync(keyFile)) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const publicKey = pair.publicKey.export({ format: 'jwk' });
  const material = { jwks: JSON.stringify({ keys: [{ ...publicKey, kid: 'offline-shell-e2e-v1', alg: 'ES256', use: 'sig' }] }),
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  writeFileSync(keyFile, JSON.stringify(material), { mode: 0o600, flag: 'wx' });
}
process.env.OFFLINE_SHELL_E2E = 'true';
process.env.VITE_KEYCLOAK_URL = '';
process.env.VITE_KEYCLOAK_REALM = '';
process.env.VITE_KEYCLOAK_CLIENT_ID = '';

const baseURL = 'http://127.0.0.1:4174';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'offline-shell.spec.ts',
  globalTeardown: './tests/e2e/offline-shell-global-teardown.ts',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:e2e:offline-shell && npm run start:e2e:offline-shell',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
