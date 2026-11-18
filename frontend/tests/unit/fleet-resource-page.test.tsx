import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { FleetApi } from '@/modules/fleet/application/fleet-api';
import { FleetResourcePage } from '@/modules/fleet/presentation/fleet-resource-page';

const scope = { kind: 'organization' as const, companyId: 'company-1', thirdPartyId: null };
const driver = { id: 'driver-1', name: 'Ana Ruiz', identification: 'CC-1234', status: 'ACTIVE' as const, version: 2 };
function setup(permissions: readonly string[] = ['drivers:update', 'drivers:deactivate']) {
  const api = { listDrivers: vi.fn(async () => ({ items: [driver], page: 1, pageSize: 20, total: 1 })), listVehicles: vi.fn(),
    updateDriver: vi.fn(async (_scope, _id, _version, input) => ({ ...driver, ...input, version: 3 })), updateVehicle: vi.fn(),
    setDriverStatus: vi.fn(async (_scope, _id, _version, status) => ({ ...driver, status, version: 3 })), setVehicleStatus: vi.fn() } as unknown as FleetApi;
  const context = { register: vi.fn(() => () => {}), capture: vi.fn(() => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() })) } as unknown as ContextStore;
  const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: null, expiresAt: Number.MAX_SAFE_INTEGER, has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  render(<MemoryRouter><FleetResourcePage resource="drivers" api={api} context={context} authorization={authorization} /></MemoryRouter>);
  return { api };
}

describe('fleet resource presentation', () => {
  it('offers edit and deactivate actions only with their permissions and calls the ports', async () => {
    const { api } = setup();
    const table = await screen.findByRole('table', { name: 'Conductores' });
    expect(within(table).getByText('Ana Ruiz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar conductor' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Ana María Ruiz' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.updateDriver).toHaveBeenCalledOnce());
    expect(api.updateDriver).toHaveBeenCalledWith(scope, 'driver-1', 2, { name: 'Ana María Ruiz', identification: 'CC-1234' }, expect.any(AbortSignal));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar conductor' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirm = screen.getByRole('dialog', { name: 'Desactivar conductor' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.setDriverStatus).toHaveBeenCalledOnce());
  });

  it('hides actions when update and deactivate permissions are absent', async () => {
    setup([]);
    const table = await screen.findByRole('table', { name: 'Conductores' });
    expect(within(table).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('edits and deactivates a vehicle through its scoped port', async () => {
    const vehicle = { id: 'vehicle-1', plate: 'ABC123', status: 'ACTIVE' as const, currentDriver: { id: 'driver-1', name: 'Ana Ruiz' }, version: 4 };
    const api = { listVehicles: vi.fn(async () => ({ items: [vehicle], page: 1, pageSize: 20, total: 1 })), updateVehicle: vi.fn(async () => vehicle), setVehicleStatus: vi.fn(async () => ({ ...vehicle, status: 'INACTIVE' as const })) } as unknown as FleetApi;
    const context = { register: vi.fn(() => () => {}), capture: vi.fn(() => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() })) } as unknown as ContextStore;
    const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: null, expiresAt: Number.MAX_SAFE_INTEGER, has: (permission: string) => ['vehicles:update', 'vehicles:deactivate'].includes(permission) })) as unknown as AuthorizationStore;
    render(<MemoryRouter><FleetResourcePage resource="vehicles" api={api} context={context} authorization={authorization} /></MemoryRouter>);
    const table = await screen.findByRole('table', { name: 'Vehículos' });
    expect(within(table).getByText('Ana Ruiz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar vehículo' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Placa' }), { target: { value: 'XYZ789' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.updateVehicle).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar vehículo' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Desactivar vehículo' })).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.setVehicleStatus).toHaveBeenCalledOnce());
  });
});
