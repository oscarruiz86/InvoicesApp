import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDto, InvoiceQuery } from '@/modules/invoices/application/invoice-api';
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: 'a'.repeat(24) };
const record: InvoiceDto = { id: 'b'.repeat(24), origin: 'MANUAL', thirdPartyId: scope.thirdPartyId!, assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24),
  vehicleId: 'e'.repeat(24), vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00', invoiceAtUtc: '2026-11-20T17:30:00.000Z',
  invoiceNumber: 'FAC-1', issuerNit: '0001', buyerDocument: '0123', amounts: { amount: '10.00', vatAmount: '0.00', otherTaxesAmount: '0.00', totalAmount: '10.00' },
  version: 1, createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:00:00.000Z', imageUrl: null };
const assignment = { id: record.assignmentId, thirdPartyId: record.thirdPartyId, vehicleId: record.vehicleId, vehiclePlate: 'ABC123',
  driver: { id: record.driverId, name: 'Ana Ruiz' }, status: 'ACTIVE' as const, startedAt: record.createdAt, endedAt: null, version: 1 };

function setup(permissions: readonly string[] = ['invoices:read']) {
  let generation = 0;
  const rawContext = createStore(() => ({ status: 'ready' as const, generation }));
  const context = Object.assign(rawContext, { capture: () => {
    const captured = generation;
    return { scope: { ...scope }, signal: new AbortController().signal, isCurrent: () => generation === captured, release: vi.fn() };
  }, register: vi.fn(() => () => {}) }) as unknown as ContextStore;
  const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: { scope, permissions, roles: ['DRIVER'] }, expiresAt: Number.MAX_SAFE_INTEGER,
    has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  const list = vi.fn(async (_scope: PermissionScope, query: InvoiceQuery) => ({ items: query.page === 1 ? [record] : [], total: 1, page: query.page, pageSize: query.pageSize }));
  const detail = vi.fn(async () => ({ invoice: record, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } }));
  const create = vi.fn<InvoiceApi['create']>(async () => record),
    update = vi.fn<InvoiceApi['update']>(async () => record), image = vi.fn(async () => new Blob());
  const api = { list, detail, create, update, image } as unknown as InvoiceApi;
  const listAssignments = vi.fn(async () => ({ items: [assignment], total: 1, page: 1, pageSize: 100 }));
  const assignments = { listAssignments } as unknown as AssignmentApi;
  return { context, authorization, api, assignments, list, detail, create, update, listAssignments, switchContext() { generation++; rawContext.setState({ generation }); } };
}
const renderPage = (deps: ReturnType<typeof setup>) => render(<InvoicesPage api={deps.api} assignments={deps.assignments} context={deps.context} authorization={deps.authorization} />);

describe('invoices page', () => {
  it('shows empty and recoverable error states', async () => {
    const empty = setup(); empty.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 }); const emptyPage = renderPage(empty);
    expect(await screen.findAllByText(/no hay facturas/i)).not.toHaveLength(0);
    emptyPage.unmount();
    const failed = setup(); failed.list.mockRejectedValueOnce(new Error('network')); renderPage(failed);
    expect(await screen.findByText('No se pudo completar la operación.')).toBeInTheDocument();
  });
  it('shows the invoice list and hides create actions without create permission', async () => {
    const deps = setup(); renderPage(deps);
    expect(await screen.findByRole('heading', { name: 'Facturas' })).toBeInTheDocument();
    expect(await screen.findAllByText('FAC-1')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Registrar factura' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ver' })[0]);
    expect(await screen.findByText(/edición no está disponible/i)).toBeInTheDocument();
    expect(deps.detail).toHaveBeenCalledWith(scope, record.id, expect.any(AbortSignal));
  });
  it('keeps a create draft, attaches a preview and prevents duplicate submissions', async () => {
    const deps = setup(['invoices:read', 'invoices:create']); renderPage(deps);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar factura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar factura manual' });
    await waitFor(() => expect(deps.listAssignments).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación' }));
    await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
    await userEvent.type(within(dialog).getByLabelText('Fecha de factura'), '2026-11-20');
    await userEvent.type(within(dialog).getByLabelText('Hora de factura'), '12:30');
    await userEvent.type(within(dialog).getByLabelText('Número de factura'), 'FAC-1');
    await userEvent.type(within(dialog).getByLabelText('NIT del emisor'), '0001');
    await userEvent.type(within(dialog).getByLabelText('Documento del adquiriente'), '0123');
    await userEvent.type(within(dialog).getByLabelText('Valor de factura'), '10');
    await userEvent.type(within(dialog).getByLabelText('Valor total'), '10');
    const file = new File(['image'], 'receipt.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText(/Adjuntar imagen/), file);
    expect(await within(dialog).findByRole('img', { name: 'Vista previa de la imagen adjunta' })).toBeInTheDocument();
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Guardar factura' }));
    await waitFor(() => expect(deps.create).toHaveBeenCalledOnce());
    expect(deps.create.mock.calls[0][1]).toMatchObject({ assignmentId: record.assignmentId, vehicleId: record.vehicleId, image: file });
    expect(deps.create.mock.calls[0][2]).toBeTruthy();
  });
  it('discards stale list responses after the organization context changes', async () => {
    const deps = setup(); let resolve!: (value: { items: InvoiceDto[]; total: number; page: number; pageSize: number }) => void;
    deps.list.mockImplementation(async (_scope, query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize }));
    deps.list.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
    renderPage(deps); deps.switchContext();
    await waitFor(() => expect(deps.list.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => resolve({ items: [record], total: 1, page: 1, pageSize: 20 }));
    expect(screen.queryAllByText('FAC-1')).toHaveLength(0);
  });
});
