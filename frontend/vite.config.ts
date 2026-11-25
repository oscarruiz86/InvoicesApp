import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const target = process.env.API_PROXY_TARGET ?? environment.API_PROXY_TARGET ?? 'http://localhost:3000';
  if (!/^https?:\/\//.test(target)) throw new Error('API_PROXY_TARGET debe ser una URL HTTP(S)');
  const offlineShellE2e = mode === 'offline-shell-e2e' || process.env.OFFLINE_SHELL_E2E === 'true';
  return {
    plugins: [react()],
    define: { __OFFLINE_SHELL_E2E__: JSON.stringify(offlineShellE2e) },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
    server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared', import.meta.url))] }, watch: { usePolling: process.env.CONTAINER_POLLING === 'true', interval: 300 }, proxy: { '/api': { target }, '/docs-assets': { target } } },
    build: { rollupOptions: { input: offlineShellE2e ? {
      app: fileURLToPath(new URL('./index.html', import.meta.url)),
      offlineShellHarness: fileURLToPath(new URL('./tests/e2e/offline-shell-harness.html', import.meta.url)),
    } : undefined } },
  };
});
