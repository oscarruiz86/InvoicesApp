import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { InvitationPage } from '@/modules/user-invitations/presentation/invitation-page';
import type { InvitationApi, InvitationRecord } from '@/modules/user-invitations/application/invitation-api';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { RequestError } from '@/shared/application/request-error';

const now = Date.now();
const makeInvitation = (id: string, expires: number): InvitationRecord => ({ id, organizationId: 'company-1', organizationType: 'COMPANY', companyId: null,
  recipientEmail: `${id}@example.invalid`, roles: ['COMPANY_ADMIN'], status: 'PENDING', expiresAt: new Date(expires).toISOString(), version: 1,
  deliveryStatus: 'LOGGED', createdAt: new Date(now - 1000).toISOString(), resolvedAt: null });
const scope: PermissionScope = { kind: 'organization', companyId: 'company-1', thirdPartyId: null };
const session: SessionPort = { snapshot: () => ({ status: 'authenticated' }), subscribe: () => () => {}, initialize: async () => {},
  login: async () => {}, logout: async () => {}, invalidate: () => {} };
const authorization = createAuthorizationStore(async value => ({ subject: 'admin', scope: value, roles: ['APP_ADMIN'], permissions: ['users:read', 'users:associate'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 }), session, { automatic: false });
const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'ORGANIZATION', organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', roles: ['APP_ADMIN'], authorization: { subject: 'admin', scope, roles: ['APP_ADMIN'], permissions: ['users:read'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 } }, generation: 1 })) as unknown as ContextStore;
const capture = () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows history filters and exposes actions only for pending invitations that have not expired', async () => {
  const list = vi.fn(async () => ({ items: [makeInvitation('active', now + 60_000), makeInvitation('expired', now - 1)], page: 1, pageSize: 20, total: 2 }));
  const api = { list, create: vi.fn(), cancel: vi.fn(), resend: vi.fn() } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<InvitationPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization as AuthorizationStore} />);
  expect(await screen.findByText('active@example.invalid')).toBeTruthy();
  expect(screen.getByText('expired@example.invalid')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Reenviar' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);
  expect(screen.getAllByText(/Entrega: Completada/i)).toHaveLength(2);
  const user = userEvent.setup(); await user.click(screen.getByRole('combobox', { name: 'Estado' }));
  await user.click(await screen.findByRole('option', { name: 'Aceptadas' }));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

it('requires confirmation before creating and gives a safe duplicate message', async () => {
  const user = userEvent.setup(); vi.spyOn(window, 'confirm').mockReturnValue(true);
  const api = { list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
    create: vi.fn(async () => { throw new RequestError('INVITATION_EXISTS'); }), cancel: vi.fn(), resend: vi.fn() } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<InvitationPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization as AuthorizationStore} />);
  await user.type(await screen.findByLabelText('Correo del destinatario'), 'person@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Crear' }));
  expect(await screen.findByText('Ya existe una invitación pendiente para este correo.')).toBeTruthy();
  expect(window.confirm).toHaveBeenCalledOnce();
});
