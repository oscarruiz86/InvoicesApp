// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';

function setup(fetcher: typeof fetch) {
  const session = { subscribe: () => () => {}, invalidate: vi.fn() } as never;
  const credentials = { getAccessToken: async () => 'token' } as never;
  return createProtectedHttp('/api', credentials, session, fetcher);
}

describe('invoice protected HTTP transport', () => {
  it('sends multipart without a JSON content type and includes the retry key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'a'.repeat(24) }));
    const http = setup(fetcher);
    const form = new FormData(); form.set('payload', '{}');
    await http.invoice('POST', 'invoices', `scope=organization&thirdPartyId=${'b'.repeat(24)}`, form, { idempotencyKey: 'stable-key' });
    const init = fetcher.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer token', 'Idempotency-Key': 'stable-key' });
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.body).toBe(form);
    http.dispose();
  });
  it('returns validated binary image bodies and rejects other content types', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Blob(['image'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } }));
    const http = setup(fetcher);
    const result = await http.invoice('GET', `invoices/${'a'.repeat(24)}/image`, `scope=organization&thirdPartyId=${'b'.repeat(24)}`, undefined, { binary: true });
    expect(result).toBeInstanceOf(Blob);
    fetcher.mockResolvedValueOnce(new Response('html', { headers: { 'Content-Type': 'text/html' } }));
    await expect(http.invoice('GET', `invoices/${'a'.repeat(24)}/image`, `scope=organization&thirdPartyId=${'b'.repeat(24)}`, undefined, { binary: true }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    http.dispose();
  });
  it('allows the paginated offline submission history request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [], total: 0, page: 1, pageSize: 20 }));
    const http = setup(fetcher);
    await http.invoice('GET', 'invoice-sync/submissions', `scope=organization&thirdPartyId=${'b'.repeat(24)}&page=1&pageSize=20`);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('http://localhost:3000/api/invoice-sync/submissions?scope=organization&thirdPartyId=bbbbbbbbbbbbbbbbbbbbbbbb&page=1&pageSize=20');
    http.dispose();
  });
});
