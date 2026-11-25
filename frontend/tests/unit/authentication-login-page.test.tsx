import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { AuthenticationLoginPage } from '@/modules/authentication/presentation/authentication-login-page';

afterEach(cleanup);

it('shows the password update message and starts an explicit login', async () => {
  const login = vi.fn(async () => {});
  const authentication = createStore(() => ({ status: 'anonymous' as const, error: 'SESSION_EXPIRED' as const, login })) as unknown as AuthenticationStore;
  render(<MemoryRouter><AuthenticationLoginPage authentication={authentication} /></MemoryRouter>);
  expect(screen.getByText('La sesión terminó. Inicia sesión para continuar.')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar inicio de sesión' }));
  expect(login).toHaveBeenCalledWith('/session');
});

it('continues authenticated users to the session destination', async () => {
  const authentication = createStore(() => ({ status: 'authenticated' as const, login: vi.fn(async () => {}) })) as unknown as AuthenticationStore;
  render(<MemoryRouter initialEntries={['/login']}><Routes>
    <Route path="/login" element={<AuthenticationLoginPage authentication={authentication} />} />
    <Route path="/session" element={<div>Sesión de Invoices App</div>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText('Sesión de Invoices App')).toBeInTheDocument();
});
