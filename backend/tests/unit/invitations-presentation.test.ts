import { expect, it, vi } from 'vitest';
import { invitationResponse } from '@/modules/organizations/presentation/invitations';
import { InvitationUseCaseError, type createInvitations } from '@/modules/organizations/application/invitations';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';

const actor: AuthenticatedActor = { subject: 'admin', username: null, name: null, email: 'admin@example.invalid', roles: [], permissions: [] };
const invitation = { id: 'invitation-1', organizationId: 'company-1', organizationType: 'COMPANY' as const, companyId: 'company-1',
  recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN' as const], status: 'PENDING' as const, expiresAt: '2026-11-14T00:00:00.000Z',
  version: 2, deliveryStatus: 'LOGGED' as const, createdAt: '2026-11-13T00:00:00.000Z', resolvedAt: null };
function service(overrides: Partial<Record<keyof ReturnType<typeof createInvitations>, ReturnType<typeof vi.fn>>> = {}) {
  return { list: vi.fn(async () => ({ items: [invitation], page: 1, pageSize: 20, total: 1 })), create: vi.fn(async () => invitation),
    get: vi.fn(async () => invitation), preview: vi.fn(async () => ({ organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', recipientEmail: invitation.recipientEmail, roles: ['COMPANY_ADMIN'], expiresAt: invitation.expiresAt, version: 2 })),
    received: vi.fn(async () => ({ items: [{ id: invitation.id, organizationId: invitation.organizationId, organizationType: invitation.organizationType, organizationName: 'Empresa', roles: invitation.roles, status: invitation.status, expiresAt: invitation.expiresAt, version: invitation.version, createdAt: invitation.createdAt, resolvedAt: invitation.resolvedAt }], page: 1, pageSize: 20, total: 1 })),
    accept: vi.fn(async () => ({ invitation, membershipId: 'member-1', membershipRevision: 1 })), reject: vi.fn(async () => invitation), cancel: vi.fn(async () => invitation), resend: vi.fn(async () => invitation),
    acceptReceived: vi.fn(async () => ({ invitation, membershipId: 'member-1', membershipRevision: 1 })), rejectReceived: vi.fn(async () => invitation),
    ...overrides } as unknown as ReturnType<typeof createInvitations>;
}

it('rejects extra fields and repeated query parameters before calling the use case', async () => {
  const useCases = service();
  const invalidBody = await invitationResponse(useCases, 'create', actor, new Request('https://app.invalid/api/invitations', { method: 'POST', body: JSON.stringify({ organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'], subject: 'attacker' }) }));
  expect(invalidBody.status).toBe(400);
  expect(useCases.create).not.toHaveBeenCalled();
  const repeated = await invitationResponse(useCases, 'list', actor, new Request('https://app.invalid/api/invitations?organizationId=a&organizationId=b&organizationType=COMPANY'));
  expect(repeated.status).toBe(400);
  expect(useCases.list).not.toHaveBeenCalled();
});

it('lists received invitations only through the authenticated inbox endpoint with no-store caching', async () => {
  const useCases = service();
  const response = await invitationResponse(useCases, 'received', actor, new Request('https://app.invalid/api/invitations/received?page=1&pageSize=20'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(useCases.received).toHaveBeenCalledWith(actor, { page: 1, pageSize: 20 });
  expect(JSON.stringify(await response.json())).not.toContain(invitation.recipientEmail);
});

it('returns a no-store invitation preview with recipient email and without secrets', async () => {
  const response = await invitationResponse(service(), 'preview', null, new Request('https://app.invalid/api/invitations/preview', { method: 'POST', body: JSON.stringify({ token: 'A'.repeat(43) }) }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body).toEqual({ organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'], expiresAt: invitation.expiresAt, version: 2 });
  expect(JSON.stringify(body)).not.toContain('tokenHash');
});

it('maps invitation expiry and conflict errors to stable no-store statuses', async () => {
  const expired = await invitationResponse(service({ preview: vi.fn(async () => { throw new InvitationUseCaseError('EXPIRED'); }) }), 'preview', null,
    new Request('https://app.invalid/api/invitations/preview', { method: 'POST', body: JSON.stringify({ token: 'A'.repeat(43) }) }));
  expect(expired.status).toBe(410);
  expect(expired.headers.get('cache-control')).toBe('no-store');
  expect(await expired.json()).toMatchObject({ error: { code: 'EXPIRED' } });
});
