import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationDeliveryDto, NotificationDeliveryReadPort } from '@/modules/notifications/application/delivery-api';
import { NotificationDeliveriesPage } from '@/modules/notifications/presentation/notification-deliveries-page';

const items: readonly NotificationDeliveryDto[] = [
  { id: 'delivery-pending', type: 'INVITATION_CREATED', channel: 'EMAIL', createdAt: '2026-11-18T12:00:00.000Z', status: 'pending', attempts: 1, nextAttemptAt: '2026-11-18T12:10:00.000Z', recipientMasked: 'a***@example.invalid', resultCode: null },
  { id: 'delivery-sent', type: 'INVITATION_RESENT', channel: 'EMAIL', createdAt: '2026-11-18T11:00:00.000Z', status: 'sent', attempts: 1, nextAttemptAt: null, recipientMasked: 'b***@example.invalid', resultCode: 'ACCEPTED' },
  { id: 'delivery-failed', type: 'INVITATION_CREATED', channel: 'EMAIL', createdAt: '2026-11-18T10:00:00.000Z', status: 'failed', attempts: 4, nextAttemptAt: null, recipientMasked: 'c***@example.invalid', resultCode: 'SMTP_TEMPORARY_FAILURE' },
];
function setup() {
  const api = { list: vi.fn(async () => ({ items, page: 1, pageSize: 20, total: 3 })), get: vi.fn(async (id: string) => items.find(item => item.id === id)!) } as unknown as NotificationDeliveryReadPort;
  render(<NotificationDeliveriesPage api={api} />);
  return { api };
}

describe('notification deliveries presentation', () => {
  it('distinguishes pending, sent and failed and opens a safe delivery detail', async () => {
    const { api } = setup();
    const table = await screen.findByRole('table', { name: 'Entregas de notificaciones' });
    expect(within(table).getByText('Pendiente')).toBeInTheDocument();
    expect(within(table).getByText('Enviada')).toBeInTheDocument();
    expect(within(table).getByText('Fallida')).toBeInTheDocument();
    expect(within(table).getByText('a***@example.invalid')).toBeInTheDocument();
    fireEvent.click(within(table).getAllByRole('button', { name: 'Ver detalle' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Detalle de entrega' });
    await waitFor(() => expect(within(dialog).getByText('Invitación creada')).toBeInTheDocument());
    expect(within(dialog).getByText('a***@example.invalid')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('delivery-pending', expect.any(AbortSignal));
  });
});
