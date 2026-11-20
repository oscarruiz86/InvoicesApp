import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { ProtectedRoute } from '@/modules/authentication/presentation/permission-guard';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { PermissionsSnapshot, PermissionScope } from '@/modules/authentication/domain/permissions';
import { createContextStore } from '@/modules/organization-context/presentation/context-store';
import { OrganizationContextGuard } from '@/modules/organization-context/presentation/organization-selector';
import { VehiclesPage } from '@/modules/fleet/presentation/vehicles-page';
import type { VehicleApi, VehicleDto } from '@/modules/fleet/application/fleet-api';
import { ApplicationError } from '@/shared/application/application-error';
import { MemoryRouter } from 'react-router';

const thirdPartyId = 'a'.repeat(24);
const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId };
const snapshot = (): PermissionsSnapshot => ({ subject: 'user', scope, roles: ['THIRD_PARTY_ADMIN'], permissions: ['vehicles:read', 'vehicles:update'],
  policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 });
const vehicle: VehicleDto = { id: 'b'.repeat(24), thirdPartyId, plate: 'ABC123', internalNumber: '0001', propertyCardNumber: '000123', status: 'ACTIVE', version: 1,
  createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z', createdBy: 'user', updatedBy: 'user', assignmentState: 'UNAVAILABLE', currentDriver: null, currentDrivers: [] };
const disposals: (() => void)[] = [];
afterEach(() => { cleanup(); disposals.splice(0).forEach(dispose => dispose()); });
async function setup() {
  let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
  const listeners = new Set<(value: SessionSnapshot) => void>();
  const invalidate = vi.fn(() => { sessionState = { status: 'error', error: 'SESSION_EXPIRED' }; listeners.forEach(listener => listener(sessionState)); });
  const session: SessionPort = { snapshot: () => sessionState, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate };
  const authentication = createAuthenticationStore(createAuthentication(session, { read: async () => ({ id: 'user', roles: ['THIRD_PARTY_ADMIN'], username: null, name: null, email: null }) }));
  const read = vi.fn(async (): Promise<PermissionsSnapshot> => snapshot());
  const authorization = createAuthorizationStore(read, session, { automatic: false, visible: () => true });
  const organization = { organizationId: thirdPartyId, organizationType: 'THIRD_PARTY' as const, organizationName: 'Transportes', roles: ['THIRD_PARTY_ADMIN' as const] };
  const resolve = vi.fn(async () => ({ kind: 'ORGANIZATION' as const, ...organization, authorization: snapshot() }));
  const confirmDiscard = vi.fn(async () => true);
  const context = createContextStore({ api: { available: async () => ({ organizations: [organization], globalAvailable: false }), resolve },
    preference: { read: () => null, write: () => true, clear: () => {} }, authentication, authorization, confirmDiscard,
    invalidateSession: invalidate, channel: { publish: () => {}, subscribe: () => () => {}, dispose: () => {} } });
  disposals.push(() => { context.dispose(); authorization.dispose(); });
  await act(async () => { await authentication.getState().loadUser(); });
  await waitFor(() => expect(context.getState().status).toBe('ready'));
  const listVehicles = vi.fn(async () => ({ items: [vehicle], page: 1, pageSize: 20, total: 1 }));
  const api: VehicleApi = { listVehicles, getVehicle: async () => vehicle, createVehicle: async () => vehicle, updateVehicle: async () => vehicle, setVehicleStatus: async () => vehicle };
  render(<MemoryRouter><ProtectedRoute authentication={authentication} authorization={authorization} permission="vehicles:read"><OrganizationContextGuard store={context} authorization={authorization}>
    <VehiclesPage api={api} context={context} authorization={authorization} />
  </OrganizationContextGuard></ProtectedRoute></MemoryRouter>);
  await screen.findByText('ABC123');
  // Mount-time initialization is separate from the background-renewal regression.
  const initialRequests = listVehicles.mock.calls.length;
  expect(initialRequests).toBeGreaterThan(0);
  return { read, authorization, context, listVehicles, initialRequests, resolve, confirmDiscard, invalidate };
}
it('does not reload business data during pending or successful same-context permission reads', async () => {
  const f = await setup();
  const before = f.authorization.getState().snapshot!;
  let finish!: (value: PermissionsSnapshot) => void;
  f.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = f.authorization.getState().refresh(); });
  expect(f.authorization.getState()).toMatchObject({ status: 'ready', refreshing: true });
  expect(screen.getByText('ABC123')).toBeInTheDocument();
  expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests);
  await act(async () => { finish({ ...snapshot(), permissions: ['vehicles:update', 'vehicles:read'], evaluatedAt: '2026-11-20T12:00:00.000Z' }); await pending; });
  for (let index = 0; index < 3; index++) await act(() => f.authorization.getState().refresh());
  expect(f.authorization.getState().snapshot?.permissions).toBe(before.permissions);
  expect(f.authorization.getState().snapshot?.roles).toBe(before.roles);
  expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests);
  expect(f.resolve).toHaveBeenCalledTimes(1);
  // Explicit user requests still load data normally.
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar vehículos' }));
  const filters = screen.getByRole('dialog', { name: 'Filtros de vehículos' });
  fireEvent.change(within(filters).getByRole('textbox', { name: 'Buscar' }), { target: { value: 'ABC' } });
  fireEvent.click(within(filters).getByRole('button', { name: 'Aplicar filtros' }));
  await waitFor(() => expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests + 1));
});
it('clears data on changed authority without automatically restoring context or refetching data', async () => {
  const f = await setup();
  const generation = f.context.getState().generation;
  const capture = f.context.capture();
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar vehículo' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: /^Número interno/ }), { target: { value: 'BORRADOR' } });
  f.read.mockResolvedValue({ ...snapshot(), policyVersion: '2', contextRevision: '2', roles: ['DRIVER'] });
  await act(() => f.authorization.getState().refresh());
  expect(f.context.getState().activeContext).toBeNull();
  expect(f.context.getState().status).toBe('selecting');
  expect(f.context.getState().generation).toBe(generation + 1);
  expect(capture.isCurrent()).toBe(false); expect(capture.signal.aborted).toBe(true); capture.release();
  expect(f.confirmDiscard).not.toHaveBeenCalled();
  expect(f.resolve).toHaveBeenCalledTimes(1); expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests);
  expect(screen.queryByRole('dialog', { name: 'Editar vehículo' })).not.toBeInTheDocument();
});
it('applies actual permission revocation immediately without fetching business data again', async () => {
  const f = await setup();
  f.read.mockResolvedValue({ ...snapshot(), permissions: ['drivers:read'] });
  await act(() => f.authorization.getState().refresh());
  expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  expect(f.authorization.getState().has('vehicles:read')).toBe(false);
  expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests);
});
it.each(['FORBIDDEN', 'UNAVAILABLE', 'UNAUTHENTICATED'] as const)('clears protected data on %s instead of keeping stale access', async code => {
  const f = await setup(); const capture = f.context.capture();
  f.read.mockRejectedValue(new ApplicationError(code));
  await act(() => f.authorization.getState().refresh());
  expect(screen.queryByText('ABC123')).not.toBeInTheDocument();
  expect(f.authorization.getState().has('vehicles:read')).toBe(false);
  expect(capture.isCurrent()).toBe(false); capture.release();
  expect(f.listVehicles).toHaveBeenCalledTimes(f.initialRequests);
  expect(f.invalidate).toHaveBeenCalledTimes(code === 'UNAUTHENTICATED' ? 1 : 0);
});
