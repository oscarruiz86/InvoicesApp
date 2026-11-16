import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { InvitationApi, ReceivedInvitation } from '@/modules/user-invitations/application/invitation-api';
import { ReceivedInvitationsPage } from '@/modules/user-invitations/presentation/received-invitations-page';

const invitation: ReceivedInvitation = { id: 'invite-1', organizationId: 'company-1', organizationType: 'COMPANY', organizationName: 'Empresa Uno', roles: ['COMPANY_ADMIN'],
  status: 'PENDING', expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), version: 2, createdAt: new Date().toISOString(), resolvedAt: null };
afterEach(cleanup);

it('shows a recipient inbox and lets the verified account explicitly accept without an invitation URL token', async () => {
  const api = { received: vi.fn(async () => ({ items: [invitation], page: 1, pageSize: 20, total: 1 })),
    acceptReceived: vi.fn(async () => ({ invitation: {} as never, membershipId: 'member-1', membershipRevision: 1 })),
    rejectReceived: vi.fn(async () => ({ invitation: {} as never })) } as unknown as InvitationApi;
  render(<MemoryRouter><ReceivedInvitationsPage api={api} /></MemoryRouter>);
  expect(await screen.findByText('Empresa Uno')).toBeInTheDocument();
  expect(screen.getByText('Roles: Administrador de empresa')).toBeInTheDocument();
  expect(screen.getByText(/Al aceptar, compartirás con la organización tu nombre completo, tipo y número de documento y correo electrónico/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Aceptar invitación' }));
  expect(api.acceptReceived).toHaveBeenCalledWith('invite-1', 2);
  expect(await screen.findByText(/Aceptaste la invitación de Empresa Uno/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Elegir organización y entrar' })).toBeInTheDocument();
});

it('keeps only terminal history visible without allowing changes', async () => {
  const api = { received: vi.fn(async () => ({ items: [{ ...invitation, status: 'EXPIRED' as const }], page: 1, pageSize: 20, total: 1 })) } as unknown as InvitationApi;
  render(<MemoryRouter><ReceivedInvitationsPage api={api} /></MemoryRouter>);
  expect(await screen.findByText(/Estado: Vencida/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar invitación' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
});
