import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AuditHistoryPage } from '@/modules/audit/presentation/audit-history-page';
import type { AuditHistoryEvent, AuditHistoryReadPort } from '@/modules/audit/application/audit-history-api';

const event: AuditHistoryEvent = { eventId:'evt_1', occurredAt:'2026-11-25T10:00:00.000Z', source:'fleet', actor:{kind:'user',subject:'admin_1',displayName:'Ana Gómez'}, action:'VEHICLE_UPDATED', result:'allowed', reason:'BUSINESS_MUTATION', correlationId:'corr_1' };

it('lists cursor pages and opens a safe read-only event detail', async () => {
  const list = vi.fn<AuditHistoryReadPort['list']>().mockResolvedValueOnce({items:[event],nextCursor:'cursor-next',pageSize:20}).mockResolvedValueOnce({items:[],nextCursor:null,pageSize:20});
  const get = vi.fn<AuditHistoryReadPort['get']>().mockResolvedValue(event);
  const api = {list,get} as AuditHistoryReadPort;
  render(<AuditHistoryPage api={api} />);
  expect(await screen.findByText('Vehículo actualizado')).toBeInTheDocument();
  expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
  expect(screen.getAllByText(/5:00:00 a\. m\. COT/).length).toBeGreaterThan(0);
  await userEvent.click(screen.getAllByRole('button',{name:'Ver detalle'})[0]);
  expect(await screen.findByRole('dialog',{name:'Detalle del evento'})).toHaveTextContent('Ana Gómez · admin_1');
  expect(screen.getByRole('dialog',{name:'Detalle del evento'})).toHaveTextContent('Código de acción: VEHICLE_UPDATED');
  expect(screen.queryByText(/payload|token|valores anteriores|factura/i)).not.toBeInTheDocument();
  const dialog = screen.getByRole('dialog',{name:'Detalle del evento'});
  await userEvent.click(screen.getByRole('button',{name:'Cerrar'}));
  await waitForElementToBeRemoved(dialog);
  await userEvent.click(screen.getByRole('button',{name:'Ir a la página siguiente'}));
  await waitFor(()=>expect(list).toHaveBeenLastCalledWith({},20,'cursor-next',expect.any(AbortSignal)));
  expect(await screen.findByText('No hay eventos para los filtros seleccionados.')).toBeInTheDocument();
});

it('clears displayed data as filters are applied and allows a retry after failure', async () => {
  const list = vi.fn<AuditHistoryReadPort['list']>().mockResolvedValueOnce({items:[event],nextCursor:null,pageSize:20}).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({items:[],nextCursor:null,pageSize:20});
  const api = {list,get:vi.fn()} as unknown as AuditHistoryReadPort;
  render(<AuditHistoryPage api={api} />);
  expect(await screen.findByText('Vehículo actualizado')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Filtrar eventos de auditoría'}));
  await screen.findByRole('dialog',{name:'Filtros de auditoría'});
  await userEvent.type(screen.getByRole('textbox',{name:'Acción'}),'INVOICE_CREATED');
  await userEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Filtros de auditoría'})).not.toBeInTheDocument());
  expect(await screen.findByText('Ocurrió un problema inesperado. Puedes volver a intentarlo.')).toBeInTheDocument();
  expect(screen.queryByText('Vehículo actualizado')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button',{name:'Reintentar'}));
  await waitFor(()=>expect(list).toHaveBeenLastCalledWith({action:'INVOICE_CREATED'},20,undefined,expect.any(AbortSignal)));
  expect(await screen.findByText('No hay eventos para los filtros seleccionados.')).toBeInTheDocument();
});

it('submits actor name or ID as an actor filter', async () => {
  const list = vi.fn<AuditHistoryReadPort['list']>().mockResolvedValue({items:[],nextCursor:null,pageSize:20});
  const api = {list,get:vi.fn()} as unknown as AuditHistoryReadPort;
  render(<AuditHistoryPage api={api} />);
  await userEvent.click(await screen.findByRole('button',{name:'Filtrar eventos de auditoría'}));
  await userEvent.type(screen.getByRole('textbox',{name:'Actor (nombre o ID)'}),'Ana Gómez');
  await userEvent.click(screen.getByRole('button',{name:'Aplicar filtros'}));
  await waitFor(()=>expect(list).toHaveBeenLastCalledWith({actor:'Ana Gómez'},20,undefined,expect.any(AbortSignal)));
});
