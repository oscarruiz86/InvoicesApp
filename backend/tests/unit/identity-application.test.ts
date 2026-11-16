import { describe, expect, it } from 'vitest';
import type { IdentityVerifier, AuthenticatedActor } from '@/modules/identity/application/identity-verifier';
import { readCurrentUser } from '@/modules/identity/application/read-current-user';
import { requireRoles } from '@/modules/identity/application/require-roles';
import { AuthenticationError, AuthorizationError } from '@/modules/identity/application/authentication-error';

const actor: AuthenticatedActor = { subject: 'subject-1', username: null, name: null, email: null, roles: ['DRIVER'], permissions: [] };
describe('provider-independent identity', () => {
  it('uses a compatible verifier without provider or persistence and exposes only the profile', async () => {
    const verifier: IdentityVerifier = { verify: async () => actor };
    expect(readCurrentUser(await verifier.verify('test-credential'))).toEqual({ user: { id: 'subject-1', username: null, name: null, email: null, roles: ['DRIVER'] } });
  });
  it('preserves authentication rejection from a substitute', async () => {
    const verifier: IdentityVerifier = { verify: async () => { throw new AuthenticationError(); } };
    await expect(verifier.verify('invalid')).rejects.toBeInstanceOf(AuthenticationError);
  });
  it('requires every role without administrative hierarchy', () => {
    expect(() => requireRoles(actor, [])).not.toThrow();
    expect(() => requireRoles(actor, ['DRIVER'])).not.toThrow();
    expect(() => requireRoles(actor, ['DRIVER', 'COMPANY_ADMIN'])).toThrow(AuthorizationError);
    expect(() => requireRoles({ ...actor, roles: ['APP_ADMIN'] }, ['DRIVER'])).toThrow(AuthorizationError);
  });
});
