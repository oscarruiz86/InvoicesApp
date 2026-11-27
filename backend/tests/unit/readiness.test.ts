import { describe, expect, it } from 'vitest';
import { createReadinessHandler } from '@/shared/presentation/http/readiness';

describe('readiness', () => {
  it('returns a neutral ready response when required dependencies are available', async () => {
    const response = await createReadinessHandler(async () => {})();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a neutral unavailable response when a dependency fails', async () => {
    const response = await createReadinessHandler(async () => { throw new Error('private detail'); })();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'not_ready' });
  });
});
