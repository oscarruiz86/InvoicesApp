import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OfflineCredentialClaims, OfflineCredentialRecord, OfflineCredentialVerifier, OfflineInvoiceQueuePort, OfflineInvoiceRecord } from '@/modules/invoices/application/offline-invoice-ports';
import type { QrDecoder } from '@/modules/invoices/application/qr-decoder';
import { OfflineInvoiceCapturePage } from '@/modules/invoices/presentation/offline-invoice-capture-page';

const assignment = { id: 'assignment-1', thirdPartyId: 'third-party-1', vehicleId: 'vehicle-1', vehiclePlate: 'ABC123',
  driver: { id: 'driver-1', name: 'Ana Ruiz' }, status: 'ACTIVE' as const, startedAt: '2026-11-20T12:00:00.000Z', endedAt: null, version: 1 };
const ticket: OfflineCredentialRecord = { id: 'driver-1:third-party-1', subject: 'driver-1', thirdPartyId: 'third-party-1',
  credential: 'signed-ticket', expiresAt: '2026-11-20T20:00:00.000Z', assignmentIds: [assignment.id], assignments: [assignment], updatedAt: '2026-11-20T12:00:00.000Z' };
const claims: OfflineCredentialClaims = { sub: ticket.subject, thirdPartyId: ticket.thirdPartyId, assignmentIds: [assignment.id],
  scope: 'invoice:offline-capture', iss: 'invoice-app', aud: 'invoice-offline-capture', iat: 1_795_174_800, exp: 1_795_203_600, jti: 'ticket-1' };
const invalidJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', kid: 'offline-v1' } as JsonWebKey & { readonly kid: string };

function setup(options: { readonly ticket?: OfflineCredentialRecord; readonly verify?: OfflineCredentialVerifier; readonly save?: OfflineInvoiceQueuePort['save']; readonly qrContent?: string;
  readonly records?: readonly OfflineInvoiceRecord[] } = {}) {
  const save = vi.fn<OfflineInvoiceQueuePort['save']>(options.save ?? (async value => ({ ...value, id: 'local-1', status: 'PENDING' as const,
    createdAt: '2026-11-20T12:30:00.000Z', idempotencyKey: value.idempotencyKey ?? 'local-1' })));
  const queue = { save, list: vi.fn(async () => [...(options.records ?? [])]), subscribe: vi.fn(() => () => {}) } as unknown as OfflineInvoiceQueuePort;
  const verify = options.verify ?? vi.fn(async () => claims);
  const decoder: QrDecoder = { preload: vi.fn(async () => {}), openCamera: vi.fn(async (_video, onResult) => {
    onResult(options.qrContent ?? 'esto no es un QR válido, se valida al sincronizar'); return { stop: vi.fn(), destroy: vi.fn() };
  }), decodeImage: vi.fn(async () => options.qrContent ?? 'contenido QR sin formato reconocido') };
  const view = render(<OfflineInvoiceCapturePage ticket={options.ticket ?? ticket} claims={claims} publicJwks={[invalidJwk]} loadDecoder={async () => decoder}
    offlineQueue={queue} verifyCredential={verify} />);
  return { queue, save, verify, decoder, view };
}

async function chooseAssignment() {
  await userEvent.click(screen.getByRole('combobox', { name: 'Vehículo y asignación' }));
  await userEvent.click(await screen.findByRole('option', { name: /ABC123/ }));
}

async function prepareQrCapture() {
  await userEvent.click(screen.getByRole('tab', { name: 'Código QR' }));
  await chooseAssignment();
  await userEvent.click(screen.getByRole('button', { name: 'Abrir cámara' }));
}

describe('offline invoice capture page', () => {
  it('renders pending sync state as a tag inside the shared responsive table surface', async () => {
    const pending: OfflineInvoiceRecord = { id: 'local-conflict', subject: ticket.subject, thirdPartyId: ticket.thirdPartyId, origin: 'MANUAL',
      assignmentId: assignment.id, vehicleId: assignment.vehicleId, payload: { invoiceNumber: 'FAC-LOCAL-2', invoiceDate: '2026-11-20',
        invoiceTime: '12:30:00', issuerNit: '900123456', buyerDocument: '900654321', amount: '100', vatAmount: '19', otherTaxesAmount: '0', totalAmount: '119' },
      status: 'CONFLICT', createdAt: '2026-11-20T12:30:00.000Z', idempotencyKey: 'local-conflict' };
    setup({ records: [pending] });

    expect(screen.queryByRole('table', { name: 'Facturas pendientes de sincronización' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('tab', { name: 'Pendientes (1)' }));
    const table = await screen.findByRole('table', { name: 'Facturas pendientes de sincronización' });
    expect(table.closest('.MuiTableContainer-root')).not.toBeNull();
    expect(table.querySelector('.MuiChip-root')).toHaveTextContent('En conflicto');
    expect(screen.getByRole('button', { name: 'Ver datos' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Captura' })).toBeInTheDocument();
  });

  it('saves a manual invoice and its image locally and labels it as unconfirmed', async () => {
    const { save, verify } = setup();
    expect(screen.getByRole('tab', { name: 'Captura' })).toBeInTheDocument();
    await chooseAssignment();
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!, timeInput = document.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(document.getElementById(`${dateInput.id}-label`)).toHaveAttribute('data-shrink', 'true');
    expect(document.getElementById(`${timeInput.id}-label`)).toHaveAttribute('data-shrink', 'true');
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: '2026-11-20' } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="time"]')!, { target: { value: '12:30' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Número de factura' }), { target: { value: 'FAC-LOCAL-1' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'NIT del emisor' }), { target: { value: '900123456' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Documento del adquiriente' }), { target: { value: '900654321' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor antes de impuestos' }), { target: { value: '1234567' } });
    expect(screen.getByRole('textbox', { name: 'Valor antes de impuestos' })).toHaveValue('1.234.567');
    fireEvent.change(screen.getByRole('textbox', { name: 'Total' }), { target: { value: '119' } });
    const image = new File(['invoice image'], 'invoice.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Adjuntar imagen de factura'), image);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en este dispositivo' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Guardado localmente. Aún no está registrado en el servidor.');
    expect(verify).toHaveBeenCalledWith(ticket, [invalidJwk]);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ subject: ticket.subject, thirdPartyId: ticket.thirdPartyId, origin: 'MANUAL',
      assignmentId: assignment.id, vehicleId: assignment.vehicleId,
      payload: expect.objectContaining({ invoiceNumber: 'FAC-LOCAL-1', issuerNit: '900123456', invoiceTime: '12:30:00', amount: '1234567', totalAmount: '119' }), image }));
  }, 20000);

  it('stores QR contents even when they cannot be parsed locally', async () => {
    const { save, decoder } = setup();
    await userEvent.click(screen.getByRole('tab', { name: 'Código QR' }));
    await chooseAssignment();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir cámara' }));
    expect(screen.queryByRole('textbox', { name: 'Contenido QR capturado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Contenido QR original' })).not.toBeInTheDocument();
    expect(await screen.findByText(/se conservará sin validar localmente/i)).toBeInTheDocument();
    expect(decoder.openCamera).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en este dispositivo' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ origin: 'QR', assignmentId: assignment.id,
      payload: { qrContent: 'esto no es un QR válido, se valida al sincronizar' } })));
    expect(await screen.findByRole('status')).toHaveTextContent('Aún no está registrado en el servidor.');
  });

  it('shows the values decoded from a QR in the invoice form without exposing its raw content', async () => {
    const { decoder } = setup({ qrContent: 'NumFac=QR-9\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=900123456\nDocAdq=123456789\nValFac=1234567\nValIva=19\nValOtroIm=0\nValTolFac=1234586' });
    await prepareQrCapture();
    expect(decoder.openCamera).toHaveBeenCalledOnce();
    expect(await screen.findByText('Datos del formulario extraídos del QR')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Número de factura' })).toHaveValue('QR-9');
    expect(screen.getByRole('textbox', { name: 'NIT del emisor' })).toHaveValue('900123456');
    expect(screen.queryByText(/NumFac=QR-9/)).not.toBeInTheDocument();
  });

  it('does not offer capture when the offline context has no cached assignments', () => {
    const { save } = setup({ ticket: { ...ticket, assignmentIds: [], assignments: [] } });
    expect(screen.getByRole('heading', { name: 'Captura offline de facturas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar en este dispositivo' })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks capture when the signed credential is invalid and reports quota exhaustion', async () => {
    const invalid = setup({ verify: vi.fn(async () => null) });
    await prepareQrCapture();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en este dispositivo' }));
    expect(await screen.findByText(/La credencial venció o no pudo validarse/)).toBeInTheDocument();
    expect(invalid.save).not.toHaveBeenCalled();
    invalid.view.unmount();

    const full = setup({ save: async () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); } });
    await prepareQrCapture();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar en este dispositivo' }));
    expect(await screen.findByText(/No hay espacio suficiente en el dispositivo/)).toBeInTheDocument();
    expect(full.save).toHaveBeenCalledOnce();
  });
});
