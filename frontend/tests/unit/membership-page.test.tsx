import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { MemoryRouter } from 'react-router';
import { MembershipPage } from '@/modules/user-invitations/presentation/membership-page';
import type { InvitationApi } from '@/modules/user-invitations/application/invitation-api';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';

const scope: PermissionScope = { kind: 'organization', companyId: 'company-1', thirdPartyId: null };
const session: SessionPort = { snapshot: () => ({ status: 'authenticated' }), subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => {} };
const authorization = createAuthorizationStore(async value => ({ subject: 'admin', scope: value, roles: ['APP_ADMIN'], permissions: ['users:read', 'users:associate'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 }), session, { automatic: false });
const initialContext = { status: 'ready', activeContext: { kind: 'ORGANIZATION' as const, organizationId: 'company-1', organizationType: 'COMPANY' as const, organizationName: 'Empresa', roles: ['APP_ADMIN' as const], authorization: { subject: 'admin', scope, roles: ['APP_ADMIN' as const], permissions: ['users:read' as const], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const } }, generation: 1 };
const contextStore = createStore(() => initialContext);
const context = contextStore as unknown as ContextStore;
const capture = () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { contextStore.setState(initialContext); });

it('shows only the shared profile fields and prevents removing the final role', async () => {
  const member = { id: 'membership-1', status: 'ACTIVE' as const, roles: ['COMPANY_ADMIN' as const], revision: 1,
    profile: { fullName: 'Ana Ejemplo', documentType: 'CC' as const, documentNumber: '12345', email: 'ana@example.invalid' } };
  const memberships = vi.fn(async () => ({ items: [member], page: 1, pageSize: 20, total: 1 }));
  const api = { memberships, profile: vi.fn(async () => member), changeRoles: vi.fn(), changeStatus: vi.fn() } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<MemoryRouter><MembershipPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization} /></MemoryRouter>);
  expect((await screen.findAllByText('Ana Ejemplo')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Correo: ana@example.invalid')).toBeNull();
  expect(screen.queryByRole('button', { name: /Quitar Administrador de empresa/i })).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Consultar usuario Ana Ejemplo' }));
  const details = await screen.findByRole('dialog', { name: 'Detalle del usuario' });
  expect(details.textContent).toContain('CC · 12345');
  expect(details.textContent).toContain('ana@example.invalid');
  expect(details.textContent).toContain('Administrador de empresa');
  expect(within(details).queryByRole('button', { name: /editar|quitar/i })).toBeNull();
  expect(screen.queryByLabelText(/nombre|correo|documento/i)).toBeNull();
  expect(memberships).toHaveBeenCalledWith(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, '', 1, { search: '', role: undefined }, expect.any(AbortSignal), 20);
});

it('discards a profile response from a previous organization context', async () => {
  const member = { id: 'membership-1', status: 'ACTIVE' as const, roles: ['COMPANY_ADMIN' as const], revision: 1,
    profile: { fullName: 'Ana Ejemplo', documentType: 'CC' as const, documentNumber: '12345', email: 'ana@example.invalid' } };
  let finish!: (value: { items: typeof member[]; page: number; pageSize: number; total: number }) => void;
  let current = true;
  const transport = vi.fn((_scope: PermissionScope, target: { organizationId: string }) => target.organizationId === 'company-1'
    ? new Promise<{ items: typeof member[]; page: number; pageSize: number; total: number }>(resolve => { finish = resolve; })
    : Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 }));
  const api = { memberships: transport } as unknown as InvitationApi;
  const scopedContext = { ...context, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => current, release: vi.fn() }) } as unknown as ContextStore;
  await act(() => authorization.getState().setContext(scope));
  render(<MemoryRouter><MembershipPage api={api} context={scopedContext} authorization={authorization} /></MemoryRouter>);
  expect(transport).toHaveBeenCalled();
  await act(async () => {
    current = false;
    (context as unknown as { setState: (value: unknown) => void }).setState({ status: 'ready', activeContext: { kind: 'ORGANIZATION', organizationId: 'company-2', organizationType: 'COMPANY', organizationName: 'Otra empresa' }, generation: 2 });
  });
  await act(async () => { finish({ items: [member], page: 1, pageSize: 20, total: 1 }); });
  expect(screen.queryByText('Ana Ejemplo')).toBeNull();
});

it('invites an associate by email from a modal', async () => {
  const user = userEvent.setup();
  const member = { id: 'membership-1', status: 'ACTIVE' as const, roles: ['COMPANY_ADMIN' as const], revision: 1,
    profile: { fullName: 'Ana Ejemplo', documentType: 'CC' as const, documentNumber: '12345', email: 'ana@example.invalid' } };
  const memberships = vi.fn(async () => ({ items: [member], page: 1, pageSize: 20, total: 1 }));
  const create = vi.fn(async () => ({ id: 'invite-1', organizationId: 'company-1', organizationType: 'COMPANY', companyId: 'company-1', recipientEmail: 'nuevo@example.invalid', roles: ['COMPANY_ADMIN'], status: 'PENDING', expiresAt: new Date().toISOString(), version: 1, deliveryStatus: 'UNKNOWN', createdAt: new Date().toISOString(), resolvedAt: null }));
  const api = { memberships, create, searchUsers: vi.fn(async () => []) } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<MemoryRouter><MembershipPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization} /></MemoryRouter>);
  await screen.findAllByText('Ana Ejemplo');
  await user.click(screen.getByRole('button', { name: 'Asociar usuario' }));
  await user.type(await screen.findByLabelText('Correo del usuario'), 'nuevo@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
  expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
  expect(create).toHaveBeenCalledWith(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, 'nuevo@example.invalid', ['COMPANY_ADMIN'], expect.any(AbortSignal));
}, 30000);

it('opens associate details and confirms suspension in a dialog', async () => {
  const user = userEvent.setup();
  const member = { id: 'membership-1', status: 'ACTIVE' as const, roles: ['COMPANY_ADMIN' as const], revision: 1,
    profile: { fullName: 'Ana Ejemplo', documentType: 'CC' as const, documentNumber: '12345', email: 'ana@example.invalid' } };
  const memberships = vi.fn(async () => ({ items: [member], page: 1, pageSize: 20, total: 1 }));
  const profile = vi.fn(async () => member); const changeStatus = vi.fn(async () => ({ ...member, status: 'INACTIVE' as const }));
  const api = { memberships, profile, changeStatus } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<MemoryRouter><MembershipPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization} /></MemoryRouter>);
  await screen.findAllByText('Ana Ejemplo');
  await user.click(screen.getByRole('button', { name: 'Consultar usuario Ana Ejemplo' }));
  expect(await screen.findByRole('dialog', { name: 'Detalle del usuario' })).toBeInTheDocument();
  expect(profile).toHaveBeenCalledWith(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, 'membership-1', expect.any(AbortSignal));
  await user.click(screen.getByRole('button', { name: 'Cerrar' }));
  await waitForElementToBeRemoved(() => screen.queryByRole('dialog', { name: 'Detalle del usuario' }));
  await user.click(screen.getByRole('button', { name: 'Suspender usuario Ana Ejemplo' }));
  expect(screen.getByRole('dialog', { name: 'Suspender asociado' })).toBeInTheDocument();
  await user.click(within(screen.getByRole('dialog', { name: 'Suspender asociado' })).getByRole('button', { name: 'Suspender' }));
  expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
  expect(changeStatus).toHaveBeenCalledWith(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, 'membership-1', 1, 'INACTIVE', expect.any(AbortSignal));
});
