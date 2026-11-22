import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { ParametersPage } from '@/modules/parameter-management/presentation/parameters-page';
import type { Parameter, ParameterApi } from '@/modules/parameter-management/application/parameter-api';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

afterEach(cleanup);

const record = {
  key: 'invoice.manual-edit-window-seconds', name: 'Ventana manual', description: 'Duración editable', type: 'integer' as const,
  unit: 'seconds' as const, initialValue: 43200, minimum: 1, maximum: 31536000, scope: 'global' as const,
  value: 43200, version: 1, effectiveFrom: '2026-11-21T00:00:00.000Z', createdAt: '2026-11-21T00:00:00.000Z', createdBy: 'tech',
  updatedAt: '2026-11-21T00:00:00.000Z', updatedBy: 'tech',
};
function setup(apiOverrides: Partial<ParameterApi> = {}, permissions: readonly string[] = ['parameters:read', 'parameters:update'], scope = 'GLOBAL') {
  const api: ParameterApi = { list: vi.fn(async () => [record]), detail: vi.fn(async () => record), history: vi.fn(async () => []), update: vi.fn(async () => ({ ...record, value: 21600, version: 2 })), ...apiOverrides };
  const authorization = createStore(() => ({ has: (permission: string) => permissions.includes(permission) })) as unknown as AuthorizationStore;
  const context = createStore(() => ({ status: 'ready', activeContext: { kind: scope } })) as unknown as ContextStore;
  const result = render(<ParametersPage api={api} authorization={authorization} context={context} />);
  return { ...result, api, authorization, context };
}

it('keeps the catalog on unrelated permission refreshes and clears it when read access is revoked', async () => {
  const list = vi.fn(async () => [{
    key: 'invoice.manual-edit-window-seconds', name: 'Ventana manual', description: 'Duración', type: 'integer' as const,
    unit: 'seconds' as const, initialValue: 43200, minimum: 1, maximum: 31536000, scope: 'global' as const,
    value: 43200, version: 1, effectiveFrom: '2026-11-21T00:00:00.000Z', createdAt: '2026-11-21T00:00:00.000Z',
    createdBy: 'tech', updatedAt: '2026-11-21T00:00:00.000Z', updatedBy: 'tech',
  }]);
  const api: ParameterApi = { list, detail: vi.fn(async () => record), history: vi.fn(async () => []), update: vi.fn(async () => { throw new Error('unused'); }) };
  const authorization = createStore(() => ({ canRead: true, noise: 0, has: (permission: string) => permission === 'parameters:read' })) as unknown as AuthorizationStore;
  const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'GLOBAL' } })) as unknown as ContextStore;

  render(<ParametersPage api={api} authorization={authorization} context={context} />);
  expect(await screen.findAllByText('Ventana manual')).not.toHaveLength(0);
  expect(list).toHaveBeenCalledTimes(1);

  act(() => authorization.setState({ noise: 1 } as never));
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText('Ventana manual')).not.toHaveLength(0);

  act(() => authorization.setState({ canRead: false, has: () => false } as never));
  await waitFor(() => expect(screen.queryAllByText('Ventana manual')).toHaveLength(0));
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Se requiere permiso parameters:read.')).toBeInTheDocument();
});

it('renders empty and error states and can retry the catalog request', async () => {
  const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  setup({ list });
  expect(await screen.findByText(/No se pudo consultar el catálogo/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Recargar' }));
  expect(await screen.findByText(/El catálogo aún no está inicializado/)).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});

it('shows the history dialog and supports editing only after current value, bounds, and no-op checks', async () => {
  const history = vi.fn(async () => [{ eventId: 'evt-1', actor: 'admin:test', at: '2026-11-21T10:00:00Z', previousValue: 43200, value: 21600, previousVersion: 1, version: 2 }]);
  const { api } = setup({ history });
  await screen.findAllByText('Ventana manual');
  fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
  const historyDialog = await screen.findByRole('dialog', { name: 'Historial: Ventana manual' });
  expect(within(historyDialog).getByText(/43200 → 21600 segundos/)).toBeInTheDocument();
  fireEvent.click(within(historyDialog).getByRole('button', { name: 'Cerrar' }));

  fireEvent.click(screen.getByRole('button', { name: 'Editar valor' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar: Ventana manual' });
  expect(within(dialog).getByText('Valor actual: 43200 segundos · versión 1')).toBeInTheDocument();
  expect(within(dialog).getByText(/El cambio se aplica también a facturas existentes/)).toBeInTheDocument();
  const input = within(dialog).getByRole('spinbutton', { name: 'Nuevo valor (segundos)' });
  const confirm = within(dialog).getByRole('button', { name: 'Confirmar cambio' });
  expect(confirm).toBeDisabled();
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(confirm);
  expect(await screen.findByText(/Ingresa un entero entre 1 y 31536000/)).toBeInTheDocument();
  expect(api.update).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '21600' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.update).toHaveBeenCalledWith(record.key, 1, 21600, expect.any(AbortSignal)));
  expect(await screen.findByText('Parámetro actualizado.')).toBeInTheDocument();
});

it('loads and displays the parameter detail view', async () => {
  const detail = vi.fn(async () => ({ ...record, value: 21600, version: 2 }));
  setup({ detail });
  await screen.findAllByText('Ventana manual');
  fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Detalle: Ventana manual' });
  expect(detail).toHaveBeenCalledWith(record.key, expect.any(AbortSignal));
  expect(within(dialog).getByText(/Valor actual: 21.600 segundos/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Rango permitido: 1–31\.536\.000 segundos/)).toBeInTheDocument();
});

it('preserves a conflicting draft and prevents duplicate submissions while saving', async () => {
  let rejectUpdate!: (error: Error) => void;
  const update = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectUpdate = reject; }));
  const { api } = setup({ update });
  await screen.findAllByText('Ventana manual');
  fireEvent.click(screen.getByRole('button', { name: 'Editar valor' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar: Ventana manual' });
  const input = within(dialog).getByRole('spinbutton', { name: 'Nuevo valor (segundos)' });
  fireEvent.change(input, { target: { value: '24000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
  expect(within(dialog).getByRole('button', { name: 'Guardando…' })).toBeDisabled();
  await act(async () => rejectUpdate(new Error('PARAMETER_VERSION_CONFLICT')));
  expect(await screen.findByText(/Tu borrador se conserva/)).toBeInTheDocument();
  expect(within(dialog).getByRole('spinbutton', { name: 'Nuevo valor (segundos)' })).toHaveValue(24000);
  expect(api.update).toHaveBeenCalledTimes(1);
});

it('guards the global scope and read/update capabilities independently', async () => {
  setup({}, ['parameters:read'], 'COMPANY');
  expect(await screen.findByText(/solo está disponible en contexto GLOBAL/)).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Parámetros funcionales' })).not.toBeInTheDocument();
});

it('does not apply a pending catalog response after global read access is revoked', async () => {
  let resolveList!: (items: readonly typeof record[]) => void;
  const list = vi.fn(() => new Promise<readonly typeof record[]>(resolve => { resolveList = resolve; }));
  const api: ParameterApi = { list, detail: vi.fn(async () => record), history: vi.fn(async () => []), update: vi.fn(async () => record) };
  const authorization = createStore(() => ({ has: () => true })) as unknown as AuthorizationStore;
  const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'GLOBAL' } })) as unknown as ContextStore;
  render(<ParametersPage api={api} authorization={authorization} context={context} />);
  expect(screen.getByLabelText('Cargando parámetros')).toBeInTheDocument();
  act(() => authorization.setState({ has: (permission: string) => permission !== 'parameters:read' } as never));
  await act(async () => resolveList([record]));
  expect(screen.queryAllByText('Ventana manual')).toHaveLength(0);
  expect(screen.getByText('Se requiere permiso parameters:read.')).toBeInTheDocument();
});

it('cancels an in-flight update and does not reload or restore its notice after access is revoked', async () => {
  let resolveUpdate!: (parameter: typeof record) => void;
  let updateSignal: AbortSignal | undefined;
  const list = vi.fn(async () => [record]);
  const api: ParameterApi = { list, detail: vi.fn(async () => record), history: vi.fn(async () => []),
    update: vi.fn((_key, _version, _value, signal) => { updateSignal = signal; return new Promise<Parameter>(resolve => { resolveUpdate = resolve; }); }) };
  const authorization = createStore(() => ({ has: () => true })) as unknown as AuthorizationStore;
  const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'GLOBAL' } })) as unknown as ContextStore;
  render(<ParametersPage api={api} authorization={authorization} context={context} />);
  await screen.findAllByText('Ventana manual');
  fireEvent.click(screen.getAllByRole('button', { name: 'Editar valor' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Editar: Ventana manual' });
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Nuevo valor (segundos)' }), { target: { value: '21600' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
  act(() => authorization.setState({ has: (permission: string) => permission !== 'parameters:read' } as never));
  expect(await screen.findByText('Se requiere permiso parameters:read.')).toBeInTheDocument();
  expect(updateSignal?.aborted).toBe(true);
  await act(async () => resolveUpdate({ ...record, value: 21600, version: 2 }));
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Parámetro actualizado.')).not.toBeInTheDocument();
});
