import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AssignmentApi, AssignmentDto, AssignmentListQuery, DriverApi, DriverDto, VehicleApi, VehicleDto } from '@/modules/fleet/application/fleet-api';
import { AssignmentsPage } from '@/modules/fleet/presentation/assignments-page';
import { RequestError } from '@/shared/application/request-error';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const assignment: AssignmentDto = { id: '1123456789abcdef01234567', thirdPartyId: scope.thirdPartyId!, vehicleId: '2123456789abcdef01234567', vehiclePlate: 'ABC123',
  driver: { id: '3123456789abcdef01234567', name: 'Ana Ruiz' }, status: 'ACTIVE', startedAt: '2026-11-20T00:00:00.000Z', endedAt: null, version: 1 };
const driver: DriverDto = { driver: { id: assignment.driver.id, thirdPartyId: scope.thirdPartyId!, status: 'ACTIVE', version: 1,
  createdAt: assignment.startedAt, updatedAt: assignment.startedAt }, identity: { name: 'Ana Ruiz', documentType: 'CC', documentNumber: '1234', email: null } };
const vehicle: VehicleDto = { id: assignment.vehicleId, thirdPartyId: scope.thirdPartyId!, plate: 'ABC123', internalNumber: '001', propertyCardNumber: '0001',
  status: 'ACTIVE', version: 1, createdAt: assignment.startedAt, updatedAt: assignment.startedAt, createdBy: 'admin', updatedBy: 'admin',
  currentDriver: null, currentDrivers: [], assignmentState: 'UNASSIGNED' };

function setup(permissions: readonly string[] = ['assignments:read', 'vehicles:assign', 'vehicles:unassign']) {
  let rows: AssignmentDto[] = [assignment];
  const listAssignments = vi.fn(async (_scope: PermissionScope, query: Partial<AssignmentListQuery> = {}) => {
    const needle = query.q?.toLocaleLowerCase();
    const matched = rows.filter(item => (!needle || [item.driver.name, item.vehicleId, item.vehiclePlate ?? ''].some(value => value.toLocaleLowerCase().includes(needle)))
      && (!query.status || item.status === query.status)
      && (!query.driverId || item.driver.id === query.driverId) && (!query.vehicleId || item.vehicleId === query.vehicleId));
    return { items: matched, page: 1, pageSize: query.pageSize ?? 20, total: matched.length };
  });
  const getAssignment = vi.fn(async () => assignment);
  const createAssignment = vi.fn(async () => ({ ...assignment, id: '4123456789abcdef01234567' }));
  const closeAssignment = vi.fn(async () => { rows = []; return { ...assignment, status: 'CLOSED' as const, endedAt: '2026-11-20T01:00:00.000Z', version: 2 }; });
  const api = { listAssignments, getAssignment, createAssignment, closeAssignment } as unknown as AssignmentApi;
  const listDrivers = vi.fn(async () => ({ items: [driver], total: 1, page: 1, pageSize: 100 }));
  const listVehicles = vi.fn(async () => ({ items: [vehicle], total: 1, page: 1, pageSize: 100 }));
  const driverApi = { listDrivers } as unknown as DriverApi, vehicleApi = { listVehicles } as unknown as VehicleApi;
  const rawContext = createStore(() => ({ status: 'ready' as 'ready' | 'switching', generation: 0 }));
  const context = Object.assign(rawContext, {
    capture: () => ({ scope: { ...scope }, signal: new AbortController().signal, isCurrent: () => rawContext.getState().status === 'ready', release: vi.fn() }),
    register: vi.fn(() => () => {}),
  }) as unknown as ContextStore;
  const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: { scope, permissions, roles: ['THIRD_PARTY_ADMIN'] }, expiresAt: Number.MAX_SAFE_INTEGER,
    has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  return { api, driverApi, vehicleApi, context, rawContext, authorization, listAssignments, getAssignment, createAssignment, closeAssignment, listDrivers, listVehicles,
    setRows(value: AssignmentDto[]) { rows = value; } };
}

function renderPage(deps: ReturnType<typeof setup>) {
  return render(<AssignmentsPage api={deps.api} drivers={deps.driverApi} vehicles={deps.vehicleApi} context={deps.context} authorization={deps.authorization} />);
}

it('shows loading then an empty state', async () => {
  const deps = setup(); deps.setRows([]);
  let resolve!: (value: { items: AssignmentDto[]; total: number; page: number; pageSize: number }) => void;
  deps.listAssignments.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
  renderPage(deps);
  expect(screen.getByRole('progressbar', { name: 'Cargando asignaciones' })).toBeInTheDocument();
  await act(async () => resolve({ items: [], total: 0, page: 1, pageSize: 20 }));
  expect(await screen.findByText('No hay asignaciones para este filtro.')).toBeInTheDocument();
});

it('shows normalized provider errors and hides create controls without assign permission', async () => {
  const unavailable = setup(); unavailable.listAssignments.mockRejectedValue(new RequestError('ASSIGNMENT_STORAGE_UNAVAILABLE'));
  const errorPage = renderPage(unavailable);
  expect(await screen.findByRole('alert')).toHaveTextContent(/\S/);
  errorPage.unmount();
  const denied = setup(['assignments:read']);
  renderPage(denied);
  expect(await screen.findAllByText('Ana Ruiz')).not.toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Nueva asignación' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finalizar asignación' })).not.toBeInTheDocument();
});

it('preserves conflict feedback when a concurrent assignment wins', async () => {
  const deps = setup(); deps.setRows([]); deps.createAssignment.mockRejectedValueOnce(new RequestError('ACTIVE_ASSIGNMENT_CONFLICT'));
  renderPage(deps);
  await userEvent.click(await screen.findByRole('button', { name: 'Nueva asignación' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nueva asignación' });
  expect(deps.listDrivers).not.toHaveBeenCalled();
  expect(deps.listVehicles).not.toHaveBeenCalled();
  const driverInput = within(dialog).getByRole('combobox', { name: 'Conductor' });
  await userEvent.type(driverInput, 'Ana');
  await userEvent.click(await screen.findByRole('option', { name: 'Ana Ruiz' }));
  const vehicleInput = within(dialog).getByRole('combobox', { name: 'Vehículo' });
  await userEvent.type(vehicleInput, 'ABC');
  await userEvent.click(await screen.findByRole('option', { name: 'ABC123 · 001' }));
  await waitFor(() => expect(deps.listDrivers).toHaveBeenLastCalledWith(scope,
    expect.objectContaining({ pageSize: 20, status: 'ACTIVE', q: 'Ana' }), expect.any(AbortSignal)));
  await waitFor(() => expect(deps.listVehicles).toHaveBeenLastCalledWith(scope,
    expect.objectContaining({ pageSize: 20, status: 'ACTIVE', q: 'ABC' }), expect.any(AbortSignal)));
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeEnabled());
  await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));
  expect(await screen.findByText(/Este conductor ya está relacionado con este vehículo/)).toBeInTheDocument();
  expect(screen.queryByText('Asignación creada.')).not.toBeInTheDocument();
});

it('keeps assigned participants selectable, rejects their duplicate pair, and allows another pair', async () => {
  const deps = setup();
  const secondVehicle: VehicleDto = { ...vehicle, id: '5123456789abcdef01234567', plate: 'XYZ789', internalNumber: '002' };
  deps.listVehicles.mockResolvedValue({ items: [vehicle, secondVehicle], total: 2, page: 1, pageSize: 100 });
  renderPage(deps);
  await userEvent.click(await screen.findByRole('button', { name: 'Nueva asignación' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nueva asignación' });
  expect(within(dialog).getByRole('combobox', { name: 'Conductor' })).toBeInTheDocument();
  const vehicleSelect = within(dialog).getByRole('combobox', { name: 'Vehículo' });
  await userEvent.type(within(dialog).getByRole('combobox', { name: 'Conductor' }), 'Ana');
  await userEvent.click(await screen.findByRole('option', { name: 'Ana Ruiz' }));
  await userEvent.type(vehicleSelect, 'ABC');
  await userEvent.click(await screen.findByRole('option', { name: 'ABC123 · 001' }));
  expect(await within(dialog).findByText(/ya está relacionado con este vehículo/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Asignar' })).toBeDisabled();
  expect(deps.createAssignment).not.toHaveBeenCalled();
  await userEvent.clear(vehicleSelect);
  await userEvent.type(vehicleSelect, 'XYZ');
  await userEvent.click(await screen.findByRole('option', { name: 'XYZ789 · 002' }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));
  await waitFor(() => expect(deps.createAssignment).toHaveBeenCalledWith(scope, { driverId: driver.driver.id, vehicleId: secondVehicle.id }, expect.any(AbortSignal)));
});

it('allows a different driver to use a vehicle that already has an active assignment', async () => {
  const deps = setup();
  const secondDriver: DriverDto = { ...driver, driver: { ...driver.driver, id: '6123456789abcdef01234567' },
    identity: { ...driver.identity!, name: 'Beatriz Mora' } };
  deps.listDrivers.mockResolvedValue({ items: [driver, secondDriver], total: 2, page: 1, pageSize: 20 });
  renderPage(deps);
  await userEvent.click(await screen.findByRole('button', { name: 'Nueva asignación' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nueva asignación' });
  const driverInput = within(dialog).getByRole('combobox', { name: 'Conductor' });
  await userEvent.type(driverInput, 'Beatriz');
  await userEvent.click(await screen.findByRole('option', { name: 'Beatriz Mora' }));
  const vehicleInput = within(dialog).getByRole('combobox', { name: 'Vehículo' });
  await userEvent.type(vehicleInput, 'ABC');
  await userEvent.click(await screen.findByRole('option', { name: 'ABC123 · 001' }));
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Asignar' }));
  await waitFor(() => expect(deps.createAssignment).toHaveBeenCalledWith(scope,
    { driverId: secondDriver.driver.id, vehicleId: vehicle.id }, expect.any(AbortSignal)));
});

it.each([360, 1280])('keeps the assignment view keyboard accessible at %i px', async width => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const deps = setup(['assignments:read']);
  renderPage(deps);
  expect(await screen.findByRole('heading', { name: 'Asignaciones' })).toBeInTheDocument();
  expect(await screen.findAllByText('Ana Ruiz')).not.toHaveLength(0);
  expect(await screen.findAllByText('ABC123')).not.toHaveLength(0);
  expect(screen.queryByRole('combobox', { name: 'Estado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Buscar conductor o vehículo' })).not.toBeInTheDocument();
  expect(screen.queryByText('Estado: Activas')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Filtrar asignaciones' }));
  const filters = await screen.findByRole('dialog', { name: 'Filtros de asignaciones' });
  expect(within(filters).getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
  await userEvent.type(within(filters).getByRole('textbox', { name: 'Buscar conductor o vehículo' }), 'ABC123');
  await userEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));
  expect(await screen.findByText('Búsqueda: ABC123')).toBeInTheDocument();
  await waitFor(() => expect(deps.listAssignments).toHaveBeenLastCalledWith(scope, expect.objectContaining({ q: 'ABC123', status: undefined }), expect.any(AbortSignal)));
  expect(screen.queryByText('Estado: Activas')).not.toBeInTheDocument();
});
