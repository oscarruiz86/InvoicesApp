import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import type { Permission, PermissionScope, PermissionsSnapshot } from '@/modules/authentication/domain/permissions';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { RequestError } from '@/shared/application/request-error';
import { createHttpRolePolicy } from '@/modules/role-management/infrastructure/http-role-policy';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import { RoleManagementPage } from '@/modules/role-management/presentation/role-management-page';
import type { RoleGrant, RolePolicyResponse } from '@/modules/role-management/domain/role-policy';

const globalScope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const ceiling: RoleGrant[] = [
  { role: 'APP_ADMIN', permission: 'roles:read', scope: 'global' },
  { role: 'APP_ADMIN', permission: 'roles:manage', scope: 'global' },
  { role: 'APP_ADMIN', permission: 'companies:read', scope: 'global' },
  { role: 'COMPANY_ADMIN', permission: 'companies:read', scope: 'company' },
];
const response = (version = '7', grants = ceiling): RolePolicyResponse => ({
  policy: { version, grants },
  catalog: { roles: ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'], permissions: ['roles:read', 'roles:manage', 'companies:read'], grantCeiling: ceiling },
});
const snapshot: PermissionsSnapshot = { subject: 'admin', scope: globalScope, roles: ['APP_ADMIN'], permissions: ['roles:read', 'roles:manage'], policyVersion: '7', contextRevision: null, evaluatedAt: new Date(0).toISOString(), refreshAfterSeconds: 30 };

function stores() {
  const refreshContext = vi.fn(async () => {});
  const authorization = createStore(() => ({
    status: 'ready' as const, scope: globalScope, snapshot, expiresAt: Date.now() + 30_000,
    refresh: vi.fn(async () => {}), setContext: refreshContext, invalidate: vi.fn(),
    has: (permission: Permission) => snapshot.permissions.includes(permission),
  })) as unknown as AuthorizationStore;
  const context = createStore(() => ({
    status: 'ready' as const,
    activeContext: { kind: 'GLOBAL' as const, roles: ['APP_ADMIN'] as const, authorization: snapshot },
    availableContexts: { organizations: [], globalAvailable: true }, generation: 1, persistent: true,
    initialize: vi.fn(async () => {}), openSelector: vi.fn(async () => true), select: vi.fn(async () => {}), clear: vi.fn(async () => {}),
  })) as unknown as ContextStore;
  return { authorization, context, refreshContext };
}

afterEach(cleanup);

describe('role policy HTTP adapter', () => {
  it('uses only the roles resource and rejects an open or malformed response', async () => {
    const roles = vi.fn(async () => response());
    const api = createHttpRolePolicy({ roles } as never);
    await expect(api.read()).resolves.toEqual(response());
    expect(roles).toHaveBeenCalledWith('GET', 'scope=global', undefined, undefined);
    await api.replace('7', ceiling);
    expect(roles).toHaveBeenLastCalledWith('PUT', 'scope=global', { expectedVersion: '7', grants: ceiling }, undefined);
    await expect(createHttpRolePolicy({ roles: async () => ({ ...response(), secret: 'must not pass' }) } as never).read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(createHttpRolePolicy({ roles: async () => ({ ...response(), policy: { version: '7', grants: ceiling.slice(1) } }) } as never).read()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('preserves role management conflict and audit capacity errors from the protected transport', async () => {
    const { createProtectedHttp } = await import('@/modules/authentication/infrastructure/protected-http');
    const session: SessionPort = { initialize: async () => {}, login: async () => {}, logout: async () => {}, snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, invalidate: vi.fn() };
    const send = async (status: number, code: string) => {
      const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, session, async () => Response.json({ error: { code, message: 'safe' } }, { status }));
      try { await http.roles(status === 409 || status === 503 ? 'PUT' : 'GET', 'scope=global', status === 409 || status === 503 ? { expectedVersion: '7', grants: ceiling } : undefined); }
      finally { http.dispose(); }
    };
    await expect(send(409, 'POLICY_CONFLICT')).rejects.toMatchObject({ businessCode: 'POLICY_CONFLICT' });
    await expect(send(503, 'POLICY_AUDIT_CAPACITY')).rejects.toMatchObject({ businessCode: 'POLICY_AUDIT_CAPACITY' });
    await expect(send(400, 'INVALID_REQUEST')).rejects.toMatchObject({ businessCode: 'INVALID_REQUEST' });
  });

  it('notifies shared permission refresh on a roles 403 without invalidating the session', async () => {
    const { createProtectedHttp } = await import('@/modules/authentication/infrastructure/protected-http');
    const session: SessionPort = { initialize: async () => {}, login: async () => {}, logout: async () => {}, snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, invalidate: vi.fn() };
    const http = createProtectedHttp('/api', { getAccessToken: async () => 'token' }, session, async () => Response.json({ error: { code: 'FORBIDDEN', message: 'no' } }, { status: 403 }));
    const denied = vi.fn(); http.subscribeForbidden(denied);
    try { await expect(http.roles('GET')).rejects.toMatchObject({ code: 'FORBIDDEN' }); }
    finally { http.dispose(); }
    expect(denied).toHaveBeenCalledOnce();
    expect(session.invalidate).not.toHaveBeenCalled();
  });
});

describe('role policy matrix', () => {
  it('shows and edits only the selected role at a time', async () => {
    const user = userEvent.setup();
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => response()) };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Administrador global' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Administrador de empresa' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Administrador de empresa' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Administrador de empresa' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Administrador global' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /companies:read en ámbito Empresa/ })).toBeChecked();
  });

  it('shows only server catalog grants, locks continuity grants and confirms before saving', async () => {
    const user = userEvent.setup();
    const updated = response('8', ceiling.filter(grant => !(grant.role === 'APP_ADMIN' && grant.permission === 'companies:read')));
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => updated) };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    const optional = screen.getByRole('checkbox', { name: /companies:read/ });
    const mandatory = screen.getByRole('checkbox', { name: /roles:read/ });
    expect(optional).toBeChecked();
    expect(mandatory).toBeChecked();
    expect(mandatory).toBeDisabled();
    await user.click(optional);
    await user.click(screen.getByRole('tab', { name: 'Administrador de empresa' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('dialog', { name: 'Confirmar cambio de permisos' })).toHaveTextContent(/Vas a reemplazar toda la matriz/);
    expect(screen.getByRole('dialog', { name: 'Confirmar cambio de permisos' })).toHaveTextContent('La versión vigente es 7.');
    expect(api.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await screen.findByText('La política se actualizó correctamente. Versión confirmada: 8.');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar cambio de permisos' })).not.toBeInTheDocument());
    expect(api.replace).toHaveBeenCalledWith('7', ceiling.filter(grant => !(grant.role === 'APP_ADMIN' && grant.permission === 'companies:read')), expect.any(AbortSignal));
    expect(fixture.refreshContext).toHaveBeenCalledWith(globalScope);
    expect(screen.getByText('Versión vigente: 8')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Administrador de empresa' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Administrador de empresa' })).toBeVisible();
  });

  it('cancels the confirmation modal without submitting or discarding the draft', async () => {
    const user = userEvent.setup();
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => response('8')) };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    const optional = screen.getByRole('checkbox', { name: /companies:read/ });
    await user.click(optional);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar cambio de permisos' });
    expect(dialog).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar cambio de permisos' })).not.toBeInTheDocument());
    expect(optional).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect(api.replace).not.toHaveBeenCalled();
  });

  it('shows accessible progress and prevents duplicate saves while the service is pending', async () => {
    const user = userEvent.setup();
    let resolveReplace!: (value: RolePolicyResponse) => void;
    const api = {
      read: vi.fn(async () => response()),
      replace: vi.fn(() => new Promise<RolePolicyResponse>(resolve => { resolveReplace = resolve; })),
    };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    await user.click(screen.getByRole('checkbox', { name: /companies:read/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar cambio' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(api.replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Guardando cambios…');
    expect(screen.getByRole('progressbar', { name: 'Guardando cambios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    await act(async () => { resolveReplace(response('8')); });
    await screen.findByText('La política se actualizó correctamente. Versión confirmada: 8.');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar cambio de permisos' })).not.toBeInTheDocument());
  });

  it('keeps a safe draft after a version conflict and requires an explicit reload', async () => {
    const user = userEvent.setup();
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => { throw new RequestError('POLICY_CONFLICT'); }) };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    const optional = screen.getByRole('checkbox', { name: /companies:read/ });
    await user.click(optional);
    await user.click(screen.getByRole('tab', { name: 'Administrador de empresa' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await screen.findByText(/La política cambió desde que la cargaste/);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar cambio de permisos' })).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Administrador de empresa' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Administrador global' }));
    expect(screen.getByRole('checkbox', { name: /companies:read/ })).not.toBeChecked();
    await user.click(screen.getByRole('tab', { name: 'Administrador de empresa' }));
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Recargar política' }));
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('tabpanel', { name: 'Administrador de empresa' })).toBeVisible());
    expect(screen.getByRole('tab', { name: 'Administrador de empresa' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('explains audit capacity failure and requires a reload before retry', async () => {
    const user = userEvent.setup();
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => { throw new RequestError('POLICY_AUDIT_CAPACITY'); }) };
    const fixture = stores();
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    await screen.findByText('Versión vigente: 7');
    await user.click(screen.getByRole('checkbox', { name: /companies:read/ }));
    await user.click(screen.getByRole('tab', { name: 'Administrador de empresa' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    await screen.findByText(/capacidad de auditoría está agotada/);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirmar cambio de permisos' })).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Administrador de empresa' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Recargar política' })).toBeEnabled();
  });

  it('does not expose policy while the context is organizational', async () => {
    const api = { read: vi.fn(async () => response()), replace: vi.fn(async () => response()) };
    const fixture = stores();
    const contextState = fixture.context.getState();
    act(() => fixture.context.setState({ ...contextState, activeContext: { kind: 'ORGANIZATION', organizationId: 'company', organizationType: 'COMPANY', organizationName: 'Example', roles: ['COMPANY_ADMIN'], authorization: snapshot } } as never));
    render(<RoleManagementPage api={api} authorization={fixture.authorization} context={fixture.context} />);
    expect(await screen.findByText('Cargando la política…')).toBeInTheDocument();
    expect(screen.getByText(/solo está disponible en el contexto GLOBAL/)).toBeInTheDocument();
    expect(api.read).not.toHaveBeenCalled();
  });
});
