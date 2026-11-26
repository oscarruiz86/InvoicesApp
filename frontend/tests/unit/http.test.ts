// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient } from '@/shared/infrastructure/http/http-client';
import { readClientEnvironment } from '@/shared/infrastructure/config/client-environment';
import { createHttpHealthAdapter } from '@/modules/home/infrastructure/http-health-adapter';
import viteConfiguration from '../../vite.config';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('public configuration and HTTP adapter', () => {
  it('keeps API and Swagger asset prefixes in host and Compose proxies', async () => {
    for (const target of ['http://localhost:3000', 'http://backend:3000']) {
      vi.stubEnv('API_PROXY_TARGET', target);
      const factory = viteConfiguration as (environment: { mode: string; command: 'serve' }) => { server: { proxy: Record<string, { target: string; rewrite?: unknown }> } };
      const configuration = factory({ mode: 'test', command: 'serve' });
      expect(configuration.server.proxy['/api'].target).toBe(target);
      expect(configuration.server.proxy['/api'].rewrite).toBeUndefined();
      expect(configuration.server.proxy['/docs-assets'].target).toBe(target);
    }
  });
  it('uses a public relative base and excludes private configuration', () => {
    expect(readClientEnvironment({ API_PROXY_TARGET: 'http://backend:3000', MONGODB_URI: 'private' })).toEqual({ apiBaseUrl: '/api', offlineCredentialPublicJwks: [], offlineCredentialMaxTtlHours: 72 });
    expect(readClientEnvironment({ VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: '  ' })).toEqual({ apiBaseUrl: '/api', offlineCredentialPublicJwks: [], offlineCredentialMaxTtlHours: 72 });
    const key = { kty: 'EC', crv: 'P-256', x: 'x'.repeat(43), y: 'y'.repeat(43), kid: 'offline-v1', alg: 'ES256', use: 'sig' };
    expect(readClientEnvironment({ VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: JSON.stringify({ keys: [key] }) }).offlineCredentialPublicJwks)
      .toMatchObject([{ kty: 'EC', crv: 'P-256', kid: 'offline-v1' }]);
    expect(() => readClientEnvironment({ VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: JSON.stringify({ keys: [{ ...key, d: 'private' }] }) })).toThrow('CONFIGURATION');
    expect(() => readClientEnvironment({ VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: JSON.stringify({ keys: [key, key] }) })).toThrow('CONFIGURATION');
    expect(() => readClientEnvironment({ VITE_API_BASE_URL: 'not-a-url' })).toThrow('CONFIGURATION');
    expect(() => readClientEnvironment({ VITE_API_BASE_URL: 'https://user:secret@example.invalid' })).toThrow('CONFIGURATION');
    expect(() => readClientEnvironment({ VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS: '73' })).toThrow('CONFIGURATION');
  });
  it('reads validated health and preserves the API prefix', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    const adapter = createHttpHealthAdapter(createHttpClient('/api', fetcher));
    expect(await adapter.read()).toEqual({ status: 'ok' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/health');
  });
  it('handles HTTP errors with HTML without parsing the body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<h1>Gateway error</h1>', { status: 502 }));
    await expect(createHttpClient('/api', fetcher).get('health')).rejects.toMatchObject({ code: 'HTTP' });
  });
  it('rejects malformed JSON and invalid successful payloads', async () => {
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json'));
    await expect(createHttpClient('/api', invalidJson).get('health')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(createHttpHealthAdapter({ get: async () => ({ status: 'unknown' }) }).read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('categorizes network failures', async () => {
    await expect(createHttpClient('/api', vi.fn().mockRejectedValue(new TypeError('private'))).get('health')).rejects.toMatchObject({ code: 'NETWORK' });
  });
  const pendingFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  it('times out instead of loading forever', async () => {
    vi.useFakeTimers();
    const result = expect(createHttpClient('/api', pendingFetch, 50).get('health')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50); await result;
  });
  it('allows cancellation', async () => {
    const controller = new AbortController();
    const result = expect(createHttpClient('/api', pendingFetch).get('health', controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort(); await result;
  });
});
