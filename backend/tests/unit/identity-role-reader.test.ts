import { expect, it, vi } from 'vitest';
import { createIdentityRoleReader } from '@/modules/identity/infrastructure/keycloak/identity-role-reader';

const configuration = { issuer: 'https://identity.example/realms/invoices', clientId: 'directory', clientSecret: 'secret' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it('reads only current realm roles through the read-only directory client', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ access_token: 'service-token' })).mockResolvedValueOnce(response([
    { id: '1', name: 'APP_ADMIN' }, { id: '2', name: 'DRIVER' }, { id: '3', name: 'unrelated' },
  ]));
  await expect(createIdentityRoleReader(() => configuration, fetcher).read('subject-1')).resolves.toEqual(['APP_ADMIN', 'DRIVER']);
  expect(fetcher.mock.calls[0][0]).toBe('https://identity.example/realms/invoices/protocol/openid-connect/token');
  expect(fetcher.mock.calls[1][0]).toBe('https://identity.example/admin/realms/invoices/users/subject-1/role-mappings/realm');
  expect(fetcher.mock.calls[1][1]).toMatchObject({ redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer service-token' } });
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain('APP_ADMIN');
});

it('returns no roles for a missing user and fails closed on malformed provider data', async () => {
  const missing = vi.fn().mockResolvedValueOnce(response({ access_token: 'service-token' })).mockResolvedValueOnce(response({}, 404));
  await expect(createIdentityRoleReader(() => configuration, missing).read('absent')).resolves.toBeNull();
  const malformed = vi.fn().mockResolvedValueOnce(response({ access_token: 'service-token' })).mockResolvedValueOnce(response([{ name: 4 }]));
  await expect(createIdentityRoleReader(() => configuration, malformed).read('subject-1')).rejects.toThrow('IDENTITY_UNAVAILABLE');
});
