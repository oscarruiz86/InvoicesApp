import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { ParametersPage } from '@/modules/parameter-management/presentation/parameters-page';
import type { ParameterApi } from '@/modules/parameter-management/application/parameter-api';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

afterEach(cleanup);

it('keeps the catalog on unrelated permission refreshes and clears it when read access is revoked', async () => {
  const list = vi.fn(async () => [{
    key: 'invoice.manual-edit-window-seconds', name: 'Ventana manual', description: 'Duración', type: 'integer' as const,
    unit: 'seconds' as const, initialValue: 43200, minimum: 1, maximum: 31536000, scope: 'global' as const,
    value: 43200, version: 1, effectiveFrom: '2026-11-21T00:00:00.000Z', createdAt: '2026-11-21T00:00:00.000Z',
    createdBy: 'tech', updatedAt: '2026-11-21T00:00:00.000Z', updatedBy: 'tech',
  }]);
  const api: ParameterApi = { list, history: vi.fn(async () => []), update: vi.fn(async () => { throw new Error('unused'); }) };
  const authorization = createStore(() => ({ canRead: true, noise: 0, has: (permission: string) => permission === 'parameters:read' })) as unknown as AuthorizationStore;
  const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'GLOBAL' } })) as unknown as ContextStore;

  render(<ParametersPage api={api} authorization={authorization} context={context} />);
  expect(await screen.findByText('Ventana manual')).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(1);

  act(() => authorization.setState({ noise: 1 } as never));
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Ventana manual')).toBeInTheDocument();

  act(() => authorization.setState({ canRead: false, has: () => false } as never));
  await waitFor(() => expect(screen.queryByText('Ventana manual')).not.toBeInTheDocument());
  expect(list).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Se requiere permiso parameters:read.')).toBeInTheDocument();
});
