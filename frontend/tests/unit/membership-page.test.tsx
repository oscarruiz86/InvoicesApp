import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
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
const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'ORGANIZATION', organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', roles: ['APP_ADMIN'], authorization: { subject: 'admin', scope, roles: ['APP_ADMIN'], permissions: ['users:read'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 } }, generation: 1 })) as unknown as ContextStore;
const capture = () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows only the shared profile fields and prevents removing the final role', async () => {
  const member = { id: 'membership-1', status: 'ACTIVE' as const, roles: ['COMPANY_ADMIN' as const], revision: 1,
    profile: { fullName: 'Ana Ejemplo', documentType: 'CC' as const, documentNumber: '12345', email: 'ana@example.invalid' } };
  const memberships = vi.fn(async () => ({ items: [member], page: 1, pageSize: 20, total: 1 }));
  const api = { memberships, changeRoles: vi.fn(), changeStatus: vi.fn() } as unknown as InvitationApi;
  await act(() => authorization.getState().setContext(scope));
  render(<MemoryRouter><MembershipPage api={api} context={{ ...context, capture } as unknown as ContextStore} authorization={authorization} /></MemoryRouter>);
  expect(await screen.findByText('Ana Ejemplo')).toBeTruthy();
  expect(screen.getByText('Documento: CC · 12345')).toBeTruthy();
  expect(screen.getByText('Correo: ana@example.invalid')).toBeTruthy();
  expect(screen.getByText('Roles: Administrador de empresa')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /quitar/i })).toBeNull();
  expect(screen.queryByLabelText(/nombre|correo|documento/i)).toBeNull();
  expect(memberships).toHaveBeenCalledWith(scope, { organizationId: 'company-1', organizationType: 'COMPANY', companyId: null }, '', 1, expect.any(AbortSignal));
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
