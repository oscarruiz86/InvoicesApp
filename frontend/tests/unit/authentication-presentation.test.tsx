import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { AuthenticationCallback, PrivateRoute, SessionPage, SessionFeedback } from '@/modules/authentication/presentation/session-page';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import { ApplicationError } from '@/shared/application/application-error';

const profile = { id: 'subject-1', username: 'driver', name: 'Test Driver', email: null, roles: ['DRIVER'] as const };
function setup(initial: SessionSnapshot = { status: 'anonymous' }, read = vi.fn(async () => profile)) {
  let snapshot = initial;
  const listeners = new Set<(value: SessionSnapshot) => void>();
  const publish = (next: SessionSnapshot) => { snapshot = next; listeners.forEach(listener => listener(next)); };
  const port: SessionPort = {
    snapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: vi.fn(async () => { publish({ status: 'initializing' }); publish({ status: 'anonymous' }); }),
    login: vi.fn(async () => { publish({ status: 'authenticating' }); }),
    logout: vi.fn(async () => { publish({ status: 'signingOut' }); publish({ status: 'anonymous' }); }),
    invalidate: vi.fn(() => publish({ status: 'error', error: 'SESSION_EXPIRED' })),
  };
  return { store: createAuthenticationStore(createAuthentication(port, { read })), port, publish, read };
}
describe('session state and private presentation', () => {
  it('redirects from the callback without unstable external-store snapshots', async () => {
    const { store } = setup({ status: 'authenticated' });
    function CurrentPath() { return <span>{useLocation().pathname}</span>; }
    render(<MemoryRouter initialEntries={['/auth/callback']}><AuthenticationCallback store={store} /><CurrentPath /></MemoryRouter>);
    expect(await screen.findByText('/session')).toBeInTheDocument();
  });
  it('waits for initialization and does not reveal private content to an anonymous visitor', async () => {
    const { store, port, publish } = setup({ status: 'initializing' });
    render(<MemoryRouter><PrivateRoute store={store}><div>Private content</div></PrivateRoute></MemoryRouter>);
    expect(screen.queryByText('Private content')).not.toBeInTheDocument(); expect(port.login).not.toHaveBeenCalled();
    act(() => publish({ status: 'anonymous' }));
    await waitFor(() => expect(port.login).toHaveBeenCalledOnce());
    expect(screen.queryByText('Private content')).not.toBeInTheDocument();
    act(() => publish({ status: 'authenticated' }));
    expect(screen.getByText('Private content')).toBeInTheDocument();
  });
  it('shows a configuration error without redirect loops', () => {
    const { store, port } = setup({ status: 'anonymous', error: 'CONFIGURATION' });
    render(<MemoryRouter><PrivateRoute store={store}><div>Private content</div></PrivateRoute></MemoryRouter>);
    expect(screen.getByText(/autenticación no está configurada/)).toBeInTheDocument(); expect(port.login).not.toHaveBeenCalled();
  });
  it('only shows active session after a valid API result', async () => {
    let complete!: (value: typeof profile) => void;
    const read = vi.fn(() => new Promise<typeof profile>(resolve => { complete = resolve; }));
    const { store } = setup({ status: 'authenticated' }, read);
    render(<SessionPage store={store} />);
    expect(screen.queryByRole('heading', { name: 'Mi perfil' })).not.toBeInTheDocument();
    await act(async () => { complete(profile); });
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.getByText('Usuario: driver')).toBeInTheDocument();
    expect(JSON.stringify(store.getState())).not.toMatch(/token|password|keycloak/i);
  });
  it('supports retry after API failure without restarting OIDC', async () => {
    const read = vi.fn(async () => profile).mockRejectedValueOnce(new ApplicationError('HTTP'));
    const { store, port } = setup({ status: 'authenticated' }, read);
    render(<SessionPage store={store} />);
    await screen.findByText(/API no está disponible/);
    expect(screen.queryByText('Mi perfil')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar sesión' }));
    await screen.findByText('Mi perfil'); expect(port.login).not.toHaveBeenCalled();
  });
  it('clears the profile on 401, refresh failure or logout and ignores late profile responses', async () => {
    const { store, publish } = setup({ status: 'authenticated' });
    await store.getState().loadUser(); expect(store.getState().user).toEqual(profile);
    publish({ status: 'refreshing' }); expect(store.getState().user).toEqual(profile);
    publish({ status: 'error', error: 'SESSION_EXPIRED' }); expect(store.getState().user).toBeNull();
    const denied = setup({ status: 'authenticated' }, vi.fn(async () => { throw new ApplicationError('UNAUTHENTICATED'); }));
    await denied.store.getState().loadUser(); expect(denied.port.invalidate).toHaveBeenCalledOnce();
    let complete!: (value: typeof profile) => void;
    const late = setup({ status: 'authenticated' }, vi.fn(() => new Promise<typeof profile>(resolve => { complete = resolve; })));
    const pending = late.store.getState().loadUser(); await late.store.getState().logout(); complete(profile); await pending;
    expect(late.store.getState().user).toBeNull(); expect(late.store.getState().status).toBe('anonymous');
  });
  it('offers explicit recovery for authentication and remote logout failures', async () => {
    const { store, port, publish } = setup({ status: 'error', error: 'AUTHENTICATION' });
    render(<SessionFeedback store={store} />);
    await userEvent.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' })); expect(port.login).toHaveBeenCalledOnce();
    act(() => publish({ status: 'error', error: 'LOGOUT_UNCONFIRMED' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar cierre remoto' })); expect(port.logout).toHaveBeenCalledOnce();
  });
});
