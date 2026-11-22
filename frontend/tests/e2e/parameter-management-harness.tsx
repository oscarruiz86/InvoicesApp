import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createStore } from 'zustand/vanilla';
import { theme } from '@/shared/theme/theme';
import type { ParameterApi } from '@/modules/parameter-management/application/parameter-api';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ParametersPage } from '@/modules/parameter-management/presentation/parameters-page';

const record = { key: 'invoice.manual-edit-window-seconds', name: 'Ventana de edición de facturas manuales',
  description: 'Tiempo desde la creación durante el que se puede editar una factura manual.', type: 'integer' as const, unit: 'seconds' as const,
  initialValue: 43200, minimum: 1, maximum: 31536000, scope: 'global' as const, value: 43200, version: 1,
  effectiveFrom: '2026-11-21T00:00:00.000Z', createdAt: '2026-11-21T00:00:00.000Z', createdBy: 'technical:init',
  updatedAt: '2026-11-21T00:00:00.000Z', updatedBy: 'technical:init' };
const api: ParameterApi = { list: async () => [record], detail: async () => record, history: async () => [], update: async (_key, _version, value) => ({ ...record, value, version: 2 }) };
const authorization = createStore(() => ({ has: (permission: string) => permission === 'parameters:read' || permission === 'parameters:update' })) as unknown as AuthorizationStore;
const context = createStore(() => ({ status: 'ready', activeContext: { kind: 'GLOBAL' } })) as unknown as ContextStore;

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><ParametersPage api={api} authorization={authorization} context={context} /></ThemeProvider>);
