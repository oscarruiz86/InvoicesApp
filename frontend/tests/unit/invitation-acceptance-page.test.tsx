import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { MemoryRouter } from 'react-router';
import { InvitationAcceptancePage } from '@/modules/user-invitations/presentation/invitation-acceptance-page';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { InvitationApi, InvitationPreview } from '@/modules/user-invitations/application/invitation-api';
import { ApplicationError } from '@/shared/application/application-error';

const token = 'A'.repeat(43);
const invitation: InvitationPreview = { organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa', recipientEmail: 'person@example.invalid', roles: ['COMPANY_ADMIN'], expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(), version: 3 };
function auth(status: 'anonymous' | 'authenticated', email?: string) {
  const login = vi.fn(async () => {}); const logout = vi.fn(async () => {});
  const profileStatus = status === 'authenticated' ? 'success' : 'idle';
  const user = email ? { id: 'person-1', username: null, name: 'Persona', email, roles: [] } : null;
  return { store: Object.assign(createStore(() => ({ status, profileStatus, user, login, logout, loadUser: vi.fn(async () => {}) })), {}) as unknown as AuthenticationStore, login };
}
function api(overrides: Partial<InvitationApi> = {}) {
  return { preview: vi.fn(async () => invitation), accept: vi.fn(async () => ({ invitation: {} as never, membershipId: 'membership-1', membershipRevision: 1 })),
    reject: vi.fn(async () => ({} as never)), ...overrides } as unknown as InvitationApi;
}
function openUrl(tokenValue: string) { window.history.replaceState(null, '', '/invitations/accept#token=' + encodeURIComponent(tokenValue)); }
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

it('keeps invitation data in the URL, prefills registration email, and accepts from a fresh browser', async () => {
  openUrl(token); const anonymous = auth('anonymous'); const service = api();
  const { unmount } = render(<MemoryRouter><InvitationAcceptancePage api={service} authentication={anonymous.store} /></MemoryRouter>);
  expect(await screen.findByText('Empresa te invita a vincularte a su organización.')).toBeTruthy();
  expect(screen.getByText(/inicia sesión o crea una cuenta.*continuarás en Mis invitaciones/i)).toBeTruthy();
  expect(new URLSearchParams(window.location.hash.slice(1)).get('token')).toBe(token);
  expect(sessionStorage.getItem('invoices.invitation-token')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Crear mi cuenta' }));
  expect(anonymous.login).toHaveBeenCalledWith('/invitations/received', expect.objectContaining({ loginHint: 'person@example.invalid', action: 'register' }));
  expect(sessionStorage.getItem('invoices.invitation-token')).toBeNull();
  unmount();

  sessionStorage.clear();
  window.history.replaceState(null, '', '/invitations/accept?token=' + encodeURIComponent(token));
  const authenticated = auth('authenticated', invitation.recipientEmail); const resolvedApi = api();
  render(<MemoryRouter><InvitationAcceptancePage api={resolvedApi} authentication={authenticated.store} /></MemoryRouter>);
  await screen.findByText('Empresa te invita a vincularte a su organización.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  expect(await screen.findByText(/Invitación aceptada\. No se pudo activar automáticamente el contexto/)).toBeTruthy();
  expect(resolvedApi.accept).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem('invoices.invitation-token')).toBeNull();
  expect(window.location.search).toBe('');
  expect(window.location.hash).toBe('');
});

it('continues to accept legacy query-string invitation links without moving the token to storage', async () => {
  window.history.replaceState(null, '', '/invitations/accept?token=' + encodeURIComponent(token));
  const service = api();
  render(<MemoryRouter><InvitationAcceptancePage api={service} authentication={auth('anonymous').store} /></MemoryRouter>);
  expect(await screen.findByText('Empresa te invita a vincularte a su organización.')).toBeTruthy();
  expect(service.preview).toHaveBeenCalledWith(token, expect.any(AbortSignal));
  expect(window.location.search).toBe('?token=' + token);
  expect(sessionStorage.getItem('invoices.invitation-token')).toBeNull();
});

it('rejects an unauthorized acceptance and does not submit twice', async () => {
  openUrl(token); const authenticated = auth('authenticated', invitation.recipientEmail); let reject!: (reason: unknown) => void;
  const accept = vi.fn(() => new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise; }));
  const service = api({ accept: accept as never });
  render(<MemoryRouter><InvitationAcceptancePage api={service} authentication={authenticated.store} /></MemoryRouter>);
  await screen.findByText('Empresa te invita a vincularte a su organización.');
  const button = screen.getByRole('button', { name: 'Aceptar invitación' });
  await userEvent.setup().dblClick(button);
  expect(accept).toHaveBeenCalledOnce();
  await act(async () => { reject(new ApplicationError('FORBIDDEN')); });
  expect(await screen.findByText('No se pudo autorizar la operación. Revisa la cuenta o solicita ayuda a la organización.')).toBeTruthy();
  await waitFor(() => expect(accept).toHaveBeenCalledOnce());
});
