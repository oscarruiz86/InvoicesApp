import { createRoot } from 'react-dom/client';
import { createStore } from 'zustand/vanilla';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { Avatar, Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { AppLayout } from '@/shared/components/app-layout';
import { RouteHeadingFocus } from '@/shared/components/route-heading-focus';
import { theme } from '@/shared/theme/theme';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { DriverApi, DriverDto } from '@/modules/fleet/application/fleet-api';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { FleetResourcePage } from '@/modules/fleet/presentation/fleet-resource-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const permissions = ['drivers:read', 'drivers:deactivate'] as const;
const snapshot = (target: PermissionScope) => ({ subject: 'browser-test', scope: target, roles: ['THIRD_PARTY_ADMIN'] as const, permissions, policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; } };
const authorization = createAuthorizationStore(async target => snapshot(target), session, { automatic: false, visible: () => true });
void authorization.getState().setContext(scope);

let driver: DriverDto = { driver: { id: '1123456789abcdef01234567', thirdPartyId: scope.thirdPartyId!, status: 'ACTIVE', version: 1,
  createdAt: '2026-01-01T12:00:00.000Z', updatedAt: '2026-01-01T12:00:00.000Z' },
  identity: { name: 'Ana Ruiz', documentType: 'CC', documentNumber: '1234', email: 'ana@example.invalid' } };
const api: DriverApi = {
  listDrivers: async () => ({ items: [driver], page: 1, pageSize: 20, total: 1 }),
  getDriver: async () => driver,
  setDriverStatus: async (_scope, _id, _version, status) => { driver = { ...driver, driver: { ...driver.driver, status, version: driver.driver.version + 1, updatedAt: new Date().toISOString() } }; return driver; },
};
const contextState = createStore(() => ({ status: 'ready' as const, activeContext: null, generation: 1 }));
const context = Object.assign(contextState, { register: () => () => {}, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} }) }) as unknown as ContextStore;

const initialPath = window.location.hash.slice(1) || '/drivers';
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><MemoryRouter initialEntries={[initialPath]}>
  <AppLayout navigation={<Stack><Button component={Link} to="/">Inicio</Button><Button component={Link} to="/drivers">Conductores</Button></Stack>} account={<Avatar>DR</Avatar>}>
    <RouteHeadingFocus />
    <Routes>
      <Route path="/drivers" element={<FleetResourcePage resource="drivers" api={api} context={context} authorization={authorization} />} />
      <Route path="/drivers/:id" element={<FleetResourcePage resource="drivers" api={api} context={context} authorization={authorization} />} />
    </Routes>
  </AppLayout>
</MemoryRouter></ThemeProvider>);
