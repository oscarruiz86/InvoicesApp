import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import type { InvoiceApi, InvoiceDto, InvoicePage, InvoiceQuery } from '@/modules/invoices/application/invoice-api';
import type { QrDecoder } from '@/modules/invoices/application/qr-decoder';
import type { OfflineCredentialVerifier, OfflineInvoiceQueuePort } from '@/modules/invoices/application/offline-invoice-ports';
import { RequestError } from '@/shared/application/request-error';
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: 'a'.repeat(24) };
const record: InvoiceDto = { id: 'b'.repeat(24), origin: 'MANUAL', captureChannel: 'ONLINE', thirdPartyId: scope.thirdPartyId!, assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24),
  vehicleId: 'e'.repeat(24), vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00', invoiceAtUtc: '2026-11-20T17:30:00.000Z',
  invoiceNumber: 'FAC-1', issuerNit: '0001', buyerDocument: '0123', amounts: { amount: '10.00', vatAmount: '0.00', otherTaxesAmount: '0.00', totalAmount: '10.00' },
  version: 1, createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:00:00.000Z', imageUrl: null };
const assignment = { id: record.assignmentId, thirdPartyId: record.thirdPartyId, vehicleId: record.vehicleId, vehiclePlate: 'ABC123',
  driver: { id: record.driverId, name: 'Ana Ruiz' }, status: 'ACTIVE' as const, startedAt: record.createdAt, endedAt: null, version: 1 };

function setup(permissions: readonly string[] = ['invoices:read'], roles: readonly string[] = ['DRIVER']) {
  let generation = 0;
  const activeContext = { kind: 'ORGANIZATION' as const, organizationId: scope.thirdPartyId!, organizationType: 'THIRD_PARTY' as const,
    organizationName: 'Transportadora', roles, authorization: { subject: 'driver-1', scope, permissions, roles } };
  const rawContext = createStore(() => ({ status: 'ready' as const, generation, activeContext }));
  const context = Object.assign(rawContext, { capture: () => {
    const captured = generation;
    return { scope: { ...scope }, signal: new AbortController().signal, isCurrent: () => generation === captured, release: vi.fn() };
  }, register: vi.fn(() => () => {}) }) as unknown as ContextStore;
  const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: { scope, permissions, roles }, expiresAt: Number.MAX_SAFE_INTEGER,
    has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  const list = vi.fn(async (_scope: PermissionScope, query: InvoiceQuery): Promise<InvoicePage> => ({ items: query.page === 1 ? [{ ...record, editability: { available: true, reason: null } }] : [], total: 1, page: query.page, pageSize: query.pageSize }));
  const detail = vi.fn<InvoiceApi['detail']>(async () => ({ invoice: record, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' } }));
  const create = vi.fn<InvoiceApi['create']>(async () => record), createQr = vi.fn<InvoiceApi['createQr']>(async () => ({ ...record, origin: 'QR' })),
    update = vi.fn<InvoiceApi['update']>(async () => record), image = vi.fn(async () => new Blob());
  const api = { list, detail, create, createQr, update, image,
    listOfflineSubmissionHistory: vi.fn(async (_scope: PermissionScope, page: number, pageSize: number) => ({ items: [], total: 0, page, pageSize })),
    listOfflineConflicts: vi.fn(async (_scope: PermissionScope, page: number, pageSize: number) => ({ items: [], total: 0, page, pageSize })) } as unknown as InvoiceApi;
  const listAssignments = vi.fn(async () => ({ items: [assignment], total: 1, page: 1, pageSize: 100 }));
  const assignments = { listAssignments } as unknown as AssignmentApi;
  const offlineQueue = { save: vi.fn(async (value: Parameters<OfflineInvoiceQueuePort['save']>[0]) => ({ ...value, id: 'offline-1', status: 'PENDING' as const, createdAt: new Date().toISOString(), idempotencyKey: value.idempotencyKey ?? 'offline-1' })),
    list: vi.fn(async () => []), listSubject: vi.fn(async () => []), recoverInterrupted: vi.fn(async () => []), update: vi.fn(async () => {}), clear: vi.fn(async () => {}),
    removeSubject: vi.fn(async () => {}), removeContext: vi.fn(async () => {}), remove: vi.fn(async () => {}), saveCredential: vi.fn(async () => {}),
    listCredentials: vi.fn(async () => []), getCredential: vi.fn(async () => null), removeCredential: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) } as unknown as OfflineInvoiceQueuePort;
  const verifyCredential: OfflineCredentialVerifier = async () => null;
  const openCamera = vi.fn<QrDecoder['openCamera']>(async () => ({ stop: vi.fn(), destroy: vi.fn() }));
  const decodeImage = vi.fn<QrDecoder['decodeImage']>(async () => qrContent);
  const decoder: QrDecoder = { openCamera, decodeImage };
  return { context, authorization, api, assignments, list, detail, create, createQr, update, listAssignments,
    offlineQueue, verifyCredential, loadQrDecoder: async () => decoder, openCamera, decodeImage, switchContext() { generation++; rawContext.setState({ generation }); } };
}
const qrContent = 'NumFac=QR-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=0001\nDocAdq=0123\nValFac=10\nValIva=0\nValOtroIm=0\nValTolFac=10';
const renderPage = (deps: ReturnType<typeof setup>) => render(<InvoicesPage api={deps.api} assignments={deps.assignments} context={deps.context} authorization={deps.authorization}
  loadQrDecoder={deps.loadQrDecoder} offlineQueue={deps.offlineQueue} verifyCredential={deps.verifyCredential} />);
async function openQrDialog() {
  await userEvent.click((await screen.findAllByRole('button', { name: 'Capturar factura' }))[0]!);
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
  it('marks offline capture in the registered list and invoice detail', async () => {
    const deps = setup(['invoices:read']);
    const offline = { ...record, captureChannel: 'OFFLINE' as const };
    deps.list.mockResolvedValue({ items: [{ ...offline, editability: { available: true, reason: null } }], total: 1, page: 1, pageSize: 20 });
    deps.detail.mockResolvedValue({ invoice: offline, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' } });
    renderPage(deps);

    const listBadges = await screen.findAllByText('Offline');
    expect(listBadges.length).toBeGreaterThan(0);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Consultar factura' }))[0]);
    expect((await screen.findAllByText('Offline')).length).toBeGreaterThan(listBadges.length);
  });
  it('shows rejected offline submissions in history instead of the synchronization queue', async () => {
    const deps = setup(['invoices:read']);
    vi.mocked(deps.api.listOfflineSubmissionHistory).mockResolvedValue({ items: [{ id: 'f'.repeat(24), thirdPartyId: scope.thirdPartyId!, origin: 'MANUAL', status: 'REJECTED',
      createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:10:00.000Z', causes: ['BUSINESS_DUPLICATE'], invoiceNumber: 'FAC-OFF-1',
      invoiceDate: '2026-11-20', issuerNit: '900111222', totalAmount: '119.00', resolutionReason: 'Duplicado confirmado.',
      resolution: { action: 'REJECT', at: '2026-11-20T12:10:00.000Z', reason: 'Duplicado confirmado.', resultInvoiceNumber: null, resultInvoiceDate: null } }],
      total: 1, page: 1, pageSize: 10 });
    renderPage(deps);
    expect(deps.api.listOfflineSubmissionHistory).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('tab', { name: 'Historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial de sincronización' })).toBeInTheDocument();
    expect(await screen.findAllByText('FAC-OFF-1')).not.toHaveLength(0);
    expect(screen.getAllByText('Rechazada').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('table', { name: 'Historial de sincronización de facturas' }))
      .getByRole('row', { name: /FAC-OFF-1/ })).toHaveTextContent('Duplicado confirmado.');
    expect(screen.queryByRole('button', { name: 'Actualizar historial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualizar listado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Pendientes de sincronización/ })).not.toBeInTheDocument();
  });
  it('lets a third-party administrator query paginated synchronization history from the toolbar', async () => {
    const deps = setup(['invoices:read'], ['THIRD_PARTY_ADMIN']);
    vi.mocked(deps.api.listOfflineSubmissionHistory).mockResolvedValue({ items: [{ id: 'e'.repeat(24), thirdPartyId: scope.thirdPartyId!, origin: 'MANUAL',
      status: 'SYNCHRONIZED', createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:01:00.000Z', causes: [],
      driverName: 'Ana conductora', vehiclePlate: 'ABC123', invoiceNumber: 'FAC-ADMIN-1', invoiceDate: '2026-11-20', issuerNit: '900111222', totalAmount: '119.00', resolutionReason: null, resolution: null }],
      total: 1, page: 1, pageSize: 10 });
    renderPage(deps);
    expect(deps.api.listOfflineSubmissionHistory).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Consultar historial' }));
    expect(await screen.findByRole('heading', { name: 'Historial de sincronización' })).toBeInTheDocument();
    expect(await screen.findAllByText('FAC-ADMIN-1')).not.toHaveLength(0);
    expect(await screen.findAllByText('Ana conductora')).not.toHaveLength(0);
    expect(await screen.findAllByText('ABC123')).not.toHaveLength(0);
    expect(deps.api.listOfflineSubmissionHistory).toHaveBeenCalledWith(scope, 1, 10, expect.any(AbortSignal));
    await userEvent.click(screen.getByRole('button', { name: 'Volver a facturas' }));
    expect(screen.queryByRole('heading', { name: 'Historial de sincronización' })).not.toBeInTheDocument();
  });
  it('shows pending records only in their tab and opens a readable detail without internal identifiers', async () => {
    const deps = setup(['invoices:read', 'invoices:create']);
    const pending = { id: 'local-pending', subject: 'driver-1', thirdPartyId: scope.thirdPartyId!, origin: 'MANUAL' as const,
      assignmentId: record.assignmentId, vehicleId: record.vehicleId, payload: { invoiceDate: '2026-11-20', invoiceTime: '11:30:00',
        invoiceNumber: 'FAC-PEND-1', issuerNit: '900111222', buyerDocument: '123456789', amount: '100', vatAmount: '19', otherTaxesAmount: '0', totalAmount: '119' },
      status: 'PENDING' as const, createdAt: '2026-11-20T12:00:00.000Z', idempotencyKey: 'local-pending' };
    vi.mocked(deps.offlineQueue.list).mockResolvedValue([pending]);
    renderPage(deps);

    const pendingTab = await screen.findByRole('tab', { name: 'Pendientes (1)' });
    expect(screen.queryByRole('heading', { name: /Pendientes de sincronización/ })).not.toBeInTheDocument();
    await userEvent.click(pendingTab);
    const pendingTable = await screen.findByRole('table', { name: 'Facturas pendientes de sincronización' });
    expect(pendingTable.querySelector('.MuiChip-root')).toHaveTextContent('Pendiente');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle' }))[0]!);
    const modal = await screen.findByRole('dialog', { name: 'Detalle del registro pendiente' });
    expect(within(modal).getAllByText(/FAC-PEND-1/)).not.toHaveLength(0);
    expect(within(modal).getByText(/Conductor: Ana Ruiz/)).toBeInTheDocument();
    expect(within(modal).queryByText(record.assignmentId)).not.toBeInTheDocument();
    expect(within(modal).queryByText(record.vehicleId)).not.toBeInTheDocument();
  });
  it('hides the offline hint for administrators and opens existing conflicts in a modal', async () => {
    const deps = setup(['invoices:read', 'invoices:update'], ['THIRD_PARTY_ADMIN']);
    const emptyQueue = renderPage(deps);
    expect(await screen.findByRole('heading', { name: 'Facturas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir bandeja de revisión' })).not.toBeInTheDocument();
    emptyQueue.unmount();
    vi.mocked(deps.api.listOfflineConflicts).mockResolvedValue({ items: [{ submission: { id: 'f'.repeat(24), thirdPartyId: scope.thirdPartyId!, origin: 'MANUAL',
      assignmentId: record.assignmentId, vehicleId: record.vehicleId, causes: ['BUSINESS_DUPLICATE'], candidateInvoiceIds: [], status: 'CONFLICT', version: 2,
      createdAt: record.createdAt, expiresAt: null, resultInvoiceId: null, resolutionReason: null },
      reviewFields: { invoiceNumber: 'FAC-REVIEW', invoiceDate: record.invoiceDate, issuerNit: record.issuerNit, totalAmount: record.amounts.totalAmount },
      candidates: [], imageAvailable: false }], total: 1, page: 1, pageSize: 20 });
    renderPage(deps);

    expect(await screen.findByRole('button', { name: 'Abrir bandeja de revisión' })).toBeInTheDocument();
    expect(screen.queryByText(/abre Facturas con conexión/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir bandeja de revisión' }));
    const modal = await screen.findByRole('dialog', { name: 'Facturas por revisar (1)' });
    expect(within(modal).getByText(/FAC-REVIEW/)).toBeInTheDocument();
    expect(within(modal).getByText(/Factura duplicada/)).toBeInTheDocument();
  });
  it('uses the configured editability after saving instead of showing a stale policy warning', async () => {
    const deps = setup(['invoices:read', 'invoices:update']);
    const detail = { invoice: record, editability: { available: true, reason: null } };
    deps.detail.mockResolvedValue(detail);
    renderPage(deps);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Editar factura' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Editar factura' });
    const invoiceTime = within(dialog).getByLabelText('Hora de factura');
    fireEvent.change(invoiceTime, { target: { value: '15:51' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar factura' }));
    expect(await screen.findByText('Factura actualizada.')).toBeInTheDocument();
    expect(deps.update).toHaveBeenCalledWith(scope, record.id, expect.objectContaining({ invoiceTime: '15:51:00' }), expect.any(AbortSignal));
    await waitFor(() => expect(deps.detail).toHaveBeenCalledWith(scope, record.id, expect.any(AbortSignal)));
    expect(screen.queryByText(/no se pudo confirmar una vigencia activa/i)).not.toBeInTheDocument();
  });
  it('keeps a create draft, attaches a preview and prevents duplicate submissions', async () => {
    const deps = setup(['invoices:read', 'invoices:create']); renderPage(deps);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Capturar factura' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Registrar factura manual' });
    await waitFor(() => expect(deps.listAssignments).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación' }));
    await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
    await userEvent.type(within(dialog).getByLabelText('Fecha de factura'), '2026-11-20');
    fireEvent.change(within(dialog).getByLabelText('Hora de factura'), { target: { value: '12:30' } });
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
    expect(deps.create.mock.calls[0][1]).toMatchObject({ assignmentId: record.assignmentId, vehicleId: record.vehicleId, invoiceTime: '12:30:00', image: file });
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
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación' }));
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
    let view = renderPage(deps);
    let dialog = await openQrDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir cámara' }));
    await waitFor(() => expect(deps.openCamera).toHaveBeenCalledOnce());
    await act(async () => onResult(qrContent));
    await within(dialog).findByDisplayValue('QR-1');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Vehículo y asignación' }));
    await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    expect(await within(dialog).findByText('No se pudo completar la operación. Inténtalo de nuevo.')).toBeInTheDocument();
    const firstKey = deps.createQr.mock.calls[0][2];
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(deps.createQr).toHaveBeenCalledTimes(2));
    expect(deps.createQr.mock.calls[1][2]).toBe(firstKey);
    expect(await screen.findByText('Factura registrada desde QR.')).toBeInTheDocument();

    view.unmount();
    deps = setup(['invoices:read', 'invoices:create']);
    deps.openCamera.mockImplementation(async (_video, callback) => { onResult = callback; return { stop: vi.fn(), destroy: vi.fn() }; });
    view = renderPage(deps);
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
