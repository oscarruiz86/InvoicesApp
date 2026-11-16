import { describe, expect, it, vi } from 'vitest';
import { IdentityProfileUnavailable, readInvitationIdentity, type IdentityProfile } from '@/modules/identity/application/identity-profile-reader';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';

const configuration = () => ({ issuer: 'http://localhost:8080/realms/invoices', directoryIssuer: 'http://keycloak:8080/realms/invoices', clientId: 'directory', clientSecret: 'private' });
const complete = (overrides: Partial<IdentityProfile> = {}): IdentityProfile => ({
  subject: 'subject-1', enabled: true, email: 'invited@example.invalid', emailVerified: true,
  fullName: 'Invited User', documentType: 'CC', documentNumber: '10203040', profileComplete: true, ...overrides,
});

describe('Keycloak identity profile reader', () => {
  it('reads only the current authorized profile and derives completeness', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'service-token' }))
      .mockResolvedValueOnce(Response.json({ id: 'subject-1', enabled: true, email: ' INVITED@Example.Invalid ', emailVerified: true, firstName: 'Invited', lastName: 'User', attributes: { document_type: ['CC'], document_number: ['10203040'] } }));
    await expect(createIdentityProfileReader(configuration, http).read('subject-1')).resolves.toEqual(complete());
    expect(http.mock.calls[1][0]).toBe('http://keycloak:8080/admin/realms/invoices/users/subject-1');
    expect(http.mock.calls[1][1]).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer service-token' } });
    expect(http.mock.calls.slice(1).every(call => call[1]?.method === undefined)).toBe(true);
  });

  it('returns no identity for 404 and marks malformed Colombian profiles incomplete', async () => {
    const missing = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(createIdentityProfileReader(configuration, missing).read('missing')).resolves.toBeNull();
    const malformed = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ id: 'subject-1', enabled: true, email: 'invited@example.invalid', emailVerified: true, firstName: 'Invited', lastName: '', attributes: { document_type: ['DNI'], document_number: ['12 30'] } }));
    await expect(createIdentityProfileReader(configuration, malformed).read('subject-1')).resolves.toMatchObject({ documentType: null, documentNumber: null, fullName: null, profileComplete: false });
  });

  it('fails closed when Keycloak or its response is unavailable', async () => {
    const outage = vi.fn().mockRejectedValue(new Error('private provider detail'));
    await expect(createIdentityProfileReader(configuration, outage).read('subject-1')).rejects.toBeInstanceOf(IdentityProfileUnavailable);
    const invalid = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ id: 'another-user', enabled: true }));
    await expect(createIdentityProfileReader(configuration, invalid).read('subject-1')).rejects.toBeInstanceOf(IdentityProfileUnavailable);
  });
});

describe('invitation identity evidence', () => {
  it('accepts a verified matching profile without requiring organization context', async () => {
    const reader = { read: vi.fn(async () => complete()) };
    await expect(readInvitationIdentity(reader, { subject: 'subject-1', recipientEmail: ' INVITED@example.invalid ' })).resolves.toEqual({ subject: 'subject-1', email: 'invited@example.invalid', emailVerified: true, profileComplete: true });
    expect(reader.read).toHaveBeenCalledWith('subject-1');
  });

  it.each([
    ['IDENTITY_MISMATCH', complete({ email: 'different@example.invalid' })],
    ['EMAIL_UNVERIFIED', complete({ emailVerified: false })],
    ['PROFILE_INCOMPLETE', complete({ profileComplete: false, documentNumber: null })],
  ] as const)('rejects %s evidence', async (code, profile) => {
    await expect(readInvitationIdentity({ read: async () => profile }, { subject: 'subject-1', recipientEmail: 'invited@example.invalid' })).rejects.toMatchObject({ code });
  });

  it('maps provider failure without manufacturing identity', async () => {
    await expect(readInvitationIdentity({ read: async () => { throw new IdentityProfileUnavailable(); } }, { subject: 'subject-1', recipientEmail: 'invited@example.invalid' })).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE' });
  });
});
