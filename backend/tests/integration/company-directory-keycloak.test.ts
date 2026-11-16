import { expect, it } from 'vitest';
import { createAdministratorDirectory } from '@/modules/identity/infrastructure/keycloak/administrator-directory';

const issuer = process.env.KEYCLOAK_DIRECTORY_TEST_ISSUER;
const clientId = process.env.KEYCLOAK_DIRECTORY_TEST_CLIENT_ID;
const clientSecret = process.env.KEYCLOAK_DIRECTORY_TEST_CLIENT_SECRET;
const subject = process.env.KEYCLOAK_DIRECTORY_TEST_SUBJECT;
if (!issuer || !clientId || !clientSecret || !subject) throw new Error('Ephemeral Keycloak directory fixture configuration required');

it('validates an enabled COMPANY_ADMIN through read-only Keycloak admin APIs', async () => {
  const directory = createAdministratorDirectory(() => ({ issuer, clientId, clientSecret }), async (input, init) => {
    const response = await fetch(input, init);
    if (new URL(String(input)).pathname.endsWith('/protocol/openid-connect/token') && response.ok) {
      const payload = await response.clone().json();
      const claims = JSON.parse(Buffer.from(payload.access_token.split('.')[1], 'base64url').toString());
      expect(claims.resource_access?.['realm-management']?.roles).toEqual(expect.arrayContaining(['query-users', 'view-users']));
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      expect(audiences).toContain(issuer.replace('/realms/', '/admin/realms/'));
      expect(claims.scope?.split(' ')).toContain('kc-admin-api');
    }
    return response;
  });
  expect(await directory.isEnabledCompanyAdministrator(subject)).toBe(true);
  expect(await directory.isEnabledCompanyAdministrator('missing-user-id')).toBe(false);
});
