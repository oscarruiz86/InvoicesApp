import { expect, it, vi } from 'vitest';
import { createAdministratorDirectory } from '@/modules/identity/infrastructure/keycloak/administrator-directory';
const config = () => ({ issuer: 'http://localhost:8080/realms/test', clientId: 'directory', clientSecret: 'private' });
it('verifies enabled identity and effective role without assigning anything', async () => {
  const http = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'service-token' })).mockResolvedValueOnce(Response.json({ id: 'target', enabled: true })).mockResolvedValueOnce(Response.json([{ name: 'COMPANY_ADMIN' }]));
  expect(await createAdministratorDirectory(config, http).isEnabledCompanyAdministrator('target')).toBe(true);
  expect(http.mock.calls[1][0]).toBe('http://localhost:8080/admin/realms/test/users/target');
  expect(http.mock.calls[2][0]).toContain('/role-mappings/realm/composite');
  expect(http.mock.calls.slice(1).every(call => !call[1].method)).toBe(true);
});
it('uses the internal Keycloak address for directory calls without changing the public token issuer', async () => {
  const http = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'service-token' })).mockResolvedValueOnce(Response.json({ id: 'target', enabled: true })).mockResolvedValueOnce(Response.json([{ name: 'COMPANY_ADMIN' }]));
  const configuration = () => ({ issuer: 'http://localhost:8181/realms/invoices', directoryIssuer: 'http://keycloak:8080/realms/invoices', clientId: 'directory', clientSecret: 'private' });
  expect(await createAdministratorDirectory(configuration, http).isEnabledCompanyAdministrator('target')).toBe(true);
  expect(http.mock.calls[0][0]).toBe('http://keycloak:8080/realms/invoices/protocol/openid-connect/token');
  expect(http.mock.calls[1][0]).toBe('http://keycloak:8080/admin/realms/invoices/users/target');
});
it.each([404, 200])('rejects unavailable or disabled target %s', async status => {
  const http = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'service-token' })).mockResolvedValueOnce(Response.json({ id: 'target', enabled: false }, { status }));
  expect(await createAdministratorDirectory(config, http).isEnabledCompanyAdministrator('target')).toBe(false);
});
it('fails closed on provider outage and never accepts role data from callers', async () => {
  const http = vi.fn().mockRejectedValue(new Error('secret diagnostics'));
  await expect(createAdministratorDirectory(config, http).isEnabledCompanyAdministrator('target')).rejects.toThrow('IDENTITY_UNAVAILABLE');
});
