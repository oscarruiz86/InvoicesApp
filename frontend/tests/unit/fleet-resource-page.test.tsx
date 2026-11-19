import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { DriverDto, FleetApi, VehicleDto } from '@/modules/fleet/application/fleet-api';
import type { InvitationApi } from '@/modules/user-invitations/application/invitation-api';
import { FleetResourcePage } from '@/modules/fleet/presentation/fleet-resource-page';
import { RequestError } from '@/shared/application/request-error';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const otherScope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '2123456789abcdef01234567' };
const driver: DriverDto = { driver: { id: '1123456789abcdef01234567', thirdPartyId: scope.thirdPartyId!, status: 'ACTIVE', version: 2,
  createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z' },
  identity: { name: 'Ana Ruiz', documentType: 'CC', documentNumber: '1234', email: 'ana@example.invalid' } };
const otherDriver: DriverDto = { ...driver, driver: { ...driver.driver, id: '3123456789abcdef01234567', thirdPartyId: otherScope.thirdPartyId! }, identity: { ...driver.identity!, name: 'Luis Soto' } };

function setup(permissions: readonly string[] = ['drivers:deactivate'], currentDriver: DriverDto = driver) {
  let activeScope = scope;
  const listDrivers = vi.fn(async (requestedScope: PermissionScope) => ({ items: [requestedScope.thirdPartyId === otherScope.thirdPartyId ? otherDriver : currentDriver], page: 1, pageSize: 20, total: 1 }));
  const getDriver = vi.fn(async () => currentDriver);
  const setDriverStatus = vi.fn(async (_scope: PermissionScope, _id: string, _version: number, status: 'ACTIVE' | 'INACTIVE') => ({ ...currentDriver, driver: { ...currentDriver.driver, status, version: 3 } }));
  const api = { listDrivers, getDriver, listVehicles: vi.fn(), updateVehicle: vi.fn(), setDriverStatus, setVehicleStatus: vi.fn() } as unknown as FleetApi;
  const rawContext = createStore(() => ({ status: 'ready' as 'ready' | 'switching', generation: 0 }));
  const context = Object.assign(rawContext, {
    capture: () => ({ scope: { ...activeScope }, signal: new AbortController().signal, isCurrent: () => rawContext.getState().status === 'ready', release: vi.fn() }),
    register: vi.fn(() => () => {}),
  }) as unknown as ContextStore;
  const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: null, expiresAt: Number.MAX_SAFE_INTEGER, has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  return { api, context, rawContext, authorization, listDrivers, getDriver, setDriverStatus, setScope(next: PermissionScope, status: 'ready' | 'switching' = 'ready') {
    activeScope = next;
    rawContext.setState(state => ({ generation: state.generation + 1, status }));
  } };
}
function renderDriverRoute(deps: ReturnType<typeof setup>, path = '/drivers') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/drivers" element={<FleetResourcePage resource="drivers" api={deps.api} context={deps.context} authorization={deps.authorization} />} />
    <Route path="/drivers/:id" element={<FleetResourcePage resource="drivers" api={deps.api} context={deps.context} authorization={deps.authorization} />} />
  </Routes></MemoryRouter>);
}

describe('fleet resource presentation', () => {
  it('renders Identity read-only, opens the view modal and confirms a versioned status transition', async () => {
    const deps = setup();
    renderDriverRoute(deps);
    const table = await screen.findByRole('table', { name: 'Conductores' });
    expect(within(table).getByText('Ana Ruiz')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Ana Ruiz' })).not.toBeInTheDocument();
    expect(within(table).getByText('CC · 1234')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Ver' }));
    const viewDialog = await screen.findByRole('dialog', { name: 'Detalle del conductor' });
    expect(viewDialog).toBeInTheDocument();
    await userEvent.click(within(viewDialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detalle del conductor' })).not.toBeInTheDocument());
    const refreshedTable = screen.getByRole('table', { name: 'Conductores' });
    deps.getDriver.mockResolvedValueOnce({ ...driver, driver: { ...driver.driver, version: 7 } });
    await userEvent.click(within(refreshedTable).getByRole('button', { name: 'Desactivar' }));
    const confirm = screen.getByRole('dialog', { name: 'Desactivar conductor' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(deps.api.setDriverStatus).toHaveBeenCalledOnce());
    expect(deps.api.setDriverStatus).toHaveBeenCalledWith(scope, driver.driver.id, 7, 'INACTIVE', expect.any(AbortSignal));
    expect(await screen.findByText('Conductor desactivado correctamente.')).toBeInTheDocument();
  });

  it('supports direct detail URLs with read-only identity and permission-gated status controls', async () => {
    const deps = setup(['drivers:read']);
    renderDriverRoute(deps, `/drivers/${driver.driver.id}`);
    expect(await screen.findByRole('heading', { name: 'Detalle del conductor' })).toBeInTheDocument();
    expect(deps.api.getDriver).toHaveBeenCalledWith(scope, driver.driver.id, expect.any(AbortSignal));
    expect(screen.getByText('ana@example.invalid')).toBeInTheDocument();
    expect(screen.getByText('Identidad canónica · solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar conductor' })).not.toBeInTheDocument();
  });

  it('opens the driver association modal in place and sends a DRIVER invitation', async () => {
    const deps = setup();
    deps.rawContext.setState({ status: 'ready', generation: 0, activeContext: {
      kind: 'ORGANIZATION', organizationId: scope.thirdPartyId!, organizationType: 'THIRD_PARTY', organizationName: 'Tercero', roles: ['THIRD_PARTY_ADMIN'],
    } } as never);
    const create = vi.fn(async () => ({}));
    const invitationApi = { create } as unknown as InvitationApi;
    render(<MemoryRouter initialEntries={['/drivers']}><Routes><Route path="/drivers" element={<FleetResourcePage resource="drivers" api={deps.api} invitationApi={invitationApi} context={deps.context} authorization={deps.authorization} />} /></Routes></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: 'Crear conductor' }));
    const dialog = screen.getByRole('dialog', { name: 'Crear asociación de conductor' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Correo del usuario' }), 'driver@example.invalid');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(scope, { organizationId: scope.thirdPartyId, organizationType: 'THIRD_PARTY', companyId: null }, 'driver@example.invalid', ['DRIVER'], expect.any(AbortSignal)));
    expect(await screen.findByText('Invitación de conductor creada correctamente.')).toBeInTheDocument();
  });

  it('keeps keyboard focus within the status confirmation dialog', async () => {
    const user = userEvent.setup();
    const deps = setup();
    renderDriverRoute(deps, `/drivers/${driver.driver.id}`);
    await user.click(await screen.findByRole('button', { name: 'Desactivar conductor' }));
    const dialog = screen.getByRole('dialog', { name: 'Desactivar conductor' });
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a neutral not-found state for an invalid direct ID without querying the API', async () => {
    const deps = setup();
    renderDriverRoute(deps, '/drivers/not-an-id');
    expect(await screen.findByText('El recurso no está disponible.')).toBeInTheDocument();
    expect(deps.api.getDriver).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    const empty = setup();
    empty.listDrivers.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });
    renderDriverRoute(empty);
    expect(await screen.findByText('No hay conductores para mostrar.')).toBeInTheDocument();

  });

  it('preserves conflict feedback and does not show success', async () => {
    const conflict = setup();
    conflict.setDriverStatus.mockRejectedValueOnce(new RequestError('CONFLICT'));
    renderDriverRoute(conflict);
    const table = await screen.findByRole('table', { name: 'Conductores' });
    await userEvent.click(within(table).getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Desactivar conductor' })).getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByText('El conductor cambió desde que se cargó. Vuelve a consultar el registro antes de intentarlo otra vez.')).toBeInTheDocument();
    expect(screen.queryByText('Conductor desactivado correctamente.')).not.toBeInTheDocument();
  });

  it('discards previous driver data as soon as organization context changes', async () => {
    const deps = setup();
    renderDriverRoute(deps);
    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    let resolveNext!: (value: { items: DriverDto[]; page: number; pageSize: number; total: number }) => void;
    deps.listDrivers.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
    act(() => deps.setScope(otherScope));
    await waitFor(() => expect(deps.api.listDrivers).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    await act(async () => resolveNext({ items: [otherDriver], page: 1, pageSize: 20, total: 1 }));
    expect(await screen.findByText('Luis Soto')).toBeInTheDocument();
    expect(deps.listDrivers.mock.calls[1][0]).toEqual(otherScope);
  });

  it('edits and deactivates a vehicle through its existing scoped port', async () => {
    const vehicle: VehicleDto = { id: 'vehicle-1', plate: 'ABC123', status: 'ACTIVE', currentDriver: { id: driver.driver.id, name: 'Ana Ruiz' }, version: 4 };
    const api = { listVehicles: vi.fn(async () => ({ items: [vehicle], page: 1, pageSize: 20, total: 1 })), listDrivers: vi.fn(), getDriver: vi.fn(),
      updateVehicle: vi.fn(async (_scope: PermissionScope, _id: string, _version: number, input: { plate: string }) => ({ ...vehicle, ...input })),
      setVehicleStatus: vi.fn(async () => ({ ...vehicle, status: 'INACTIVE' as const })), setDriverStatus: vi.fn() } as unknown as FleetApi;
    const rawContext = createStore(() => ({ status: 'ready' as const, generation: 0 }));
    const context = Object.assign(rawContext, { capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: vi.fn() }), register: vi.fn(() => () => {}) }) as unknown as ContextStore;
    const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: null, expiresAt: Number.MAX_SAFE_INTEGER,
      has: (permission: string) => ['vehicles:update', 'vehicles:deactivate'].includes(permission) })) as unknown as AuthorizationStore;
    render(<MemoryRouter initialEntries={['/vehicles']}><Routes><Route path="/vehicles" element={<FleetResourcePage resource="vehicles" api={api} context={context} authorization={authorization} />} /></Routes></MemoryRouter>);
    const table = await screen.findByRole('table', { name: 'Vehículos' });
    expect(within(table).getByText('Ana Ruiz')).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar vehículo' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Placa' }), { target: { value: 'XYZ789' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.updateVehicle).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar vehículo' })).not.toBeInTheDocument());
    await userEvent.click(within(table).getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Desactivar vehículo' })).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.setVehicleStatus).toHaveBeenCalledOnce());
  });
});
