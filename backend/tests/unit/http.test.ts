import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { technicalEndpoint } from '@/bootstrap/technical-endpoint';
import { errorResponse } from '@/shared/presentation/http/errors';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('technical HTTP boundary', () => {
  it('returns uncached JSON health without connecting external services', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:1/unreachable');
    vi.stubEnv('KEYCLOAK_ISSUER_URL', ''); vi.stubEnv('KEYCLOAK_AUDIENCE', '');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
  it('fails runtime configuration without leaking its values', async () => {
    vi.stubEnv('MONGODB_URI', 'TOP_SECRET');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'CONFIGURATION_ERROR', message: 'El servicio no está configurado correctamente.' } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('TOP_SECRET');
  });
  it('translates unexpected failures without exposing stack or original message', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1/test');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await technicalEndpoint(() => { throw new Error('PRIVATE_STACK'); });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE_STACK');
    expect(await errorResponse(new Error('private')).json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });
});
