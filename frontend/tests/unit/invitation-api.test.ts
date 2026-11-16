import { expect, it, vi } from 'vitest';
import { createInvitationApi } from '@/modules/user-invitations/infrastructure/http-invitation-api';
import type { InvitationTransport } from '@/modules/user-invitations/application/invitation-api';
import { ApplicationError } from '@/shared/application/application-error';

const invitation = { id: 'invite-1', organizationId: 'company-1', organizationType: 'COMPANY', companyId: null, recipientEmail: 'person@example.invalid',
  roles: ['COMPANY_ADMIN'], status: 'PENDING', expiresAt: '2026-11-14T12:00:00.000Z', version: 1, deliveryStatus: 'LOGGED', createdAt: '2026-11-13T12:00:00.000Z', resolvedAt: null };

function fixture() {
  const transport: InvitationTransport = { organization: vi.fn(async () => ({ items: [invitation], page: 1, pageSize: 20, total: 1 })), previewInvitation: vi.fn(async () => ({
    organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'], expiresAt: invitation.expiresAt, version: 1,
  })) };
  return { api: createInvitationApi(transport), transport };
}

it('builds scoped pages and validates invitation DTOs without exposing token fields', async () => {
  const f = fixture(); const scope = { kind: 'global' as const, companyId: null, thirdPartyId: null };
  await expect(f.api.list(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, '', 1)).resolves.toMatchObject({ items: [invitation], total: 1 });
  expect(f.transport.organization).toHaveBeenCalledWith('GET', 'invitations', expect.stringContaining('organizationId=company-1'), undefined, undefined);
  expect(JSON.stringify(await f.api.list(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, '', 1))).not.toContain('token');
});

it('sends a company as its own companyId when creating a company invitation', async () => {
  const f = fixture(); const scope = { kind: 'global' as const, companyId: null, thirdPartyId: null };
  f.transport.organization = vi.fn(async () => invitation);
  await f.api.create(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, 'person@example.invalid', ['COMPANY_ADMIN']);
  expect(f.transport.organization).toHaveBeenCalledWith('POST', 'invitations', '', {
    organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'],
  }, undefined);
});

it('keeps preview public and rejects malformed responses', async () => {
  const f = fixture(); await f.api.preview('A'.repeat(43)); expect(f.transport.previewInvitation).toHaveBeenCalledWith('A'.repeat(43), undefined);
  const invalid = createInvitationApi({ ...f.transport, organization: async () => ({ items: [{ ...invitation, secretToken: 'leak' }], page: 1, pageSize: 20, total: 1 }) });
  await expect(invalid.list({ kind: 'global', companyId: null, thirdPartyId: null }, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, '', 1)).rejects.toBeInstanceOf(ApplicationError);
});

it('loads recipient invitations and resolves them by authenticated invitation id', async () => {
  const received = { id: 'invite-1', organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', roles: ['COMPANY_ADMIN'], status: 'PENDING',
    expiresAt: invitation.expiresAt, version: 1, createdAt: invitation.createdAt, resolvedAt: null };
  const transport: InvitationTransport = { organization: vi.fn(async (_method, path) => path === 'invitations/received' ? { items: [received], page: 1, pageSize: 20, total: 1 }
    : path.endsWith('/accept') ? { invitation: { ...invitation, status: 'ACCEPTED', version: 2 }, membershipId: 'member-1', membershipRevision: 1 } : invitation), previewInvitation: vi.fn(async () => ({})) };
  const api = createInvitationApi(transport);
  await expect(api.received()).resolves.toMatchObject({ items: [received], total: 1 });
  expect(transport.organization).toHaveBeenCalledWith('GET', 'invitations/received', 'page=1&pageSize=20', undefined, undefined);
  await api.acceptReceived('invite-1', 1);
  expect(transport.organization).toHaveBeenCalledWith('POST', 'invitations/received/invite-1/accept', '', { expectedVersion: 1 }, undefined);
});

it('rejects membership targets outside the selected organization before transport', async () => {
  const f = fixture(); const scope = { kind: 'organization' as const, companyId: 'company-1', thirdPartyId: null };
  expect(() => f.api.memberships(scope, { organizationId: 'other-company', organizationType: 'COMPANY', companyId: null }, '', 1)).toThrow('FORBIDDEN');
  expect(f.transport.organization).not.toHaveBeenCalled();
});
