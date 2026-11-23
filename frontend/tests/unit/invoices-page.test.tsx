import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDto, InvoicePage, InvoiceQuery } from '@/modules/invoices/application/invoice-api';
import type { QrDecoder } from '@/modules/invoices/application/qr-decoder';
import { RequestError } from '@/shared/application/request-error';
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
  const list = vi.fn(async (_scope: PermissionScope, query: InvoiceQuery): Promise<InvoicePage> => ({ items: query.page === 1 ? [{ ...record, editability: { available: true, reason: null } }] : [], total: 1, page: query.page, pageSize: query.pageSize }));
  const detail = vi.fn(async () => ({ invoice: record, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } }));
  const create = vi.fn<InvoiceApi['create']>(async () => record), createQr = vi.fn<InvoiceApi['createQr']>(async () => ({ ...record, origin: 'QR' })),
    update = vi.fn<InvoiceApi['update']>(async () => record), image = vi.fn(async () => new Blob());
  const api = { list, detail, create, createQr, update, image } as unknown as InvoiceApi;
  const listAssignments = vi.fn(async () => ({ items: [assignment], total: 1, page: 1, pageSize: 100 }));
  const assignments = { listAssignments } as unknown as AssignmentApi;
  const openCamera = vi.fn<QrDecoder['openCamera']>(async () => ({ stop: vi.fn(), destroy: vi.fn() }));
  const decodeImage = vi.fn<QrDecoder['decodeImage']>(async () => qrContent);
  const decoder: QrDecoder = { openCamera, decodeImage };
  return { context, authorization, api, assignments, list, detail, create, createQr, update, listAssignments,
    loadQrDecoder: async () => decoder, openCamera, decodeImage, switchContext() { generation++; rawContext.setState({ generation }); } };
}
const qrContent = 'NumFac=QR-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=0001\nDocAdq=0123\nValFac=10\nValIva=0\nValOtroIm=0\nValTolFac=10';
const renderPage = (deps: ReturnType<typeof setup>) => render(<InvoicesPage api={deps.api} assignments={deps.assignments} context={deps.context} authorization={deps.authorization} loadQrDecoder={deps.loadQrDecoder} />);
async function openQrDialog() {
  await userEvent.click((await screen.findAllByRole('button', { name: 'Registrar factura' }))[0]!);
  const manualDialog = await screen.findByRole('dialog', { name: 'Registrar factura manual' });
  await userEvent.click(within(manualDialog).getByRole('button', { name: 'Registrar desde QR' }));
  return screen.findByRole('dialog', { name: 'Registrar factura desde QR' });
}

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
    await userEvent.click((await screen.findAllByRole('button', { name: 'Consultar factura' }))[0]);
    expect(await screen.findByText(/no se pudo confirmar una vigencia activa/i)).toBeInTheDocument();
    expect(deps.detail).toHaveBeenCalledWith(scope, record.id, expect.any(AbortSignal));
  });
  it('keeps a create draft, attaches a preview and prevents duplicate submissions', async () => {
    const deps = setup(['invoices:read', 'invoices:create']); renderPage(deps);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Registrar factura' }))[0]!);
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
  }, 20000);
  it('reads QR through the camera, keeps extracted fields read-only, and requires an explicit assignment and confirmation', async () => {
    const deps = setup(['invoices:read', 'invoices:create']);
    deps.openCamera.mockImplementation(async (_video, onResult) => { queueMicrotask(() => onResult(qrContent)); return { stop: vi.fn(), destroy: vi.fn() }; });
    renderPage(deps);
    const dialog = await openQrDialog();
    await waitFor(() => expect(deps.listAssignments).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    expect(await within(dialog).findByDisplayValue('QR-1')).toHaveAttribute('readonly');
    expect(within(dialog).getByDisplayValue('0001')).toHaveAttribute('readonly');
    expect(within(dialog).getByRole('textbox', { name: 'Total' })).toHaveAttribute('readonly');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación propia' }));
    await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
    const attachment = new File(['attachment'], 'receipt.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText('Adjunto opcional de la factura'), attachment);
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(deps.createQr).toHaveBeenCalledOnce());
    expect(deps.createQr.mock.calls[0][1]).toMatchObject({ qrContent, assignmentId: record.assignmentId, vehicleId: record.vehicleId, image: attachment });
    expect(deps.createQr.mock.calls[0][2]).toBeTruthy();
    expect(await screen.findByText('Factura registrada desde QR.')).toBeInTheDocument();
  });
  it('uses the first camera result once and releases the scanner when the dialog closes', async () => {
    const deps = setup(['invoices:read', 'invoices:create']); let onResult!: (value: string) => void;
    const session = { stop: vi.fn(), destroy: vi.fn() };
    deps.openCamera.mockImplementation(async (_video, callback) => { onResult = callback; return session; });
    renderPage(deps);
    const dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    await waitFor(() => expect(deps.openCamera).toHaveBeenCalledOnce());
    await act(async () => { onResult(qrContent); onResult('second code must be ignored'); });
    expect(await within(dialog).findByDisplayValue('QR-1')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(session.destroy).toHaveBeenCalledOnce());
  });
  it('retries create with the same idempotency key and allows cancelling before save', async () => {
    let deps = setup(['invoices:read', 'invoices:create']); let onResult!: (value: string) => void;
    deps.openCamera.mockImplementation(async (_video, callback) => { onResult = callback; return { stop: vi.fn(), destroy: vi.fn() }; });
    deps.createQr.mockRejectedValueOnce(new RequestError('TEMPORARY_UNAVAILABLE'));
    renderPage(deps);
    let dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    await waitFor(() => expect(deps.openCamera).toHaveBeenCalledOnce());
    await act(async () => onResult(qrContent));
    await within(dialog).findByDisplayValue('QR-1');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación propia' }));
    await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    expect(await within(dialog).findByText('No se pudo completar la operación. Inténtalo de nuevo.')).toBeInTheDocument();
    const firstKey = deps.createQr.mock.calls[0][2];
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(deps.createQr).toHaveBeenCalledTimes(2));
    expect(deps.createQr.mock.calls[1][2]).toBe(firstKey);
    expect(await screen.findByText('Factura registrada desde QR.')).toBeInTheDocument();

    deps = setup(['invoices:read', 'invoices:create']);
    deps.openCamera.mockImplementation(async (_video, callback) => { onResult = callback; return { stop: vi.fn(), destroy: vi.fn() }; });
    const view = renderPage(deps);
    dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    await waitFor(() => expect(deps.openCamera).toHaveBeenCalledOnce());
    await act(async () => onResult(qrContent));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    view.unmount();
    expect(deps.createQr).not.toHaveBeenCalled();
  });
  it('shows permission, missing-camera and invalid-image guidance without opening manual fields', async () => {
    const denied = setup(['invoices:read', 'invoices:create']); denied.openCamera.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const view = renderPage(denied);
    let dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    expect(await within(dialog).findByText(/el navegador no concedió acceso a la cámara/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    view.unmount();

    const noCamera = setup(['invoices:read', 'invoices:create']); noCamera.openCamera.mockRejectedValueOnce(new DOMException('no camera', 'NotFoundError'));
    const noCameraView = renderPage(noCamera);
    const noCameraDialog = await openQrDialog();
    await userEvent.click(within(noCameraDialog).getByRole('button', { name: 'Abrir cámara' }));
    expect(await within(noCameraDialog).findByText(/este dispositivo no tiene una cámara disponible/i)).toBeInTheDocument();
    noCameraView.unmount();

    const image = setup(['invoices:read', 'invoices:create']); image.decodeImage.mockRejectedValueOnce(new Error('QR_IMAGE_INVALID'));
    renderPage(image); dialog = await openQrDialog();
    await userEvent.upload(within(dialog).getByLabelText('Imagen con código QR'), new File(['bad'], 'bad.png', { type: 'image/png' }));
    expect(await within(dialog).findByText(/archivo seleccionado no es una imagen válida/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Número de factura' })).not.toBeInTheDocument();

    const incomplete = setup(['invoices:read', 'invoices:create']);
    incomplete.openCamera.mockImplementation(async (_video, onResult) => { queueMicrotask(() => onResult('NumFac=QR-1')); return { stop: vi.fn(), destroy: vi.fn() }; });
    renderPage(incomplete); dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    expect(await within(dialog).findByText(/no incluye todos los campos obligatorios/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: 'Número de factura' })).not.toBeInTheDocument();
  }, 20000);
  it('discards stale list responses after the organization context changes', async () => {
    const deps = setup(); let resolve!: (value: InvoicePage) => void;
    deps.list.mockImplementation(async (_scope, query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize }));
    deps.list.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
    renderPage(deps); deps.switchContext();
    await waitFor(() => expect(deps.list.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => resolve({ items: [{ ...record, editability: { available: true, reason: null } }], total: 1, page: 1, pageSize: 20 }));
    expect(screen.queryAllByText('FAC-1')).toHaveLength(0);
  });
});
