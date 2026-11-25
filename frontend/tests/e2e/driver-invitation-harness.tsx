import { createRoot } from 'react-dom/client';
import { createStore } from 'zustand/vanilla';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { Avatar, Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { AppLayout } from '@/shared/components/app-layout';
import { RouteHeadingFocus } from '@/shared/components/route-heading-focus';
import { theme } from '@/shared/theme/theme';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { DriverApi, DriverDto } from '@/modules/fleet/application/fleet-api';
import type { InvitationApi, InvitationPreview, InvitationRecord, ReceivedInvitation } from '@/modules/user-invitations/application/invitation-api';
import { InvitationAcceptancePage } from '@/modules/user-invitations/presentation/invitation-acceptance-page';
import { ReceivedInvitationsPage } from '@/modules/user-invitations/presentation/received-invitations-page';
import { FleetResourcePage } from '@/modules/fleet/presentation/fleet-resource-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const preview: InvitationPreview = { organizationId: scope.thirdPartyId!, organizationType: 'THIRD_PARTY', organizationName: 'Transportes Andinos', recipientEmail: 'driver@example.invalid', roles: ['DRIVER'], expiresAt: new Date(Date.now() + 86_400_000).toISOString(), version: 1 };
const acceptedInvitation: InvitationRecord = { id: 'invitation-1', organizationId: scope.thirdPartyId!, organizationType: 'THIRD_PARTY', companyId: null,
  recipientEmail: preview.recipientEmail, roles: ['DRIVER'], status: 'ACCEPTED', expiresAt: preview.expiresAt, version: 2, deliveryStatus: 'LOGGED', createdAt: new Date().toISOString(), resolvedAt: new Date().toISOString() };
const receivedInvitation: ReceivedInvitation = { id: 'invitation-1', organizationId: scope.thirdPartyId!, organizationType: 'THIRD_PARTY',
  organizationName: 'Transportes Andinos', roles: ['DRIVER'], status: 'PENDING', expiresAt: preview.expiresAt, version: 1, createdAt: new Date().toISOString(), resolvedAt: null };
const authentication = createStore(() => ({ status: 'authenticated' as const, credentialRevision: 1, profileStatus: 'success' as const,
  user: { id: 'subject-driver-1', username: 'driver', name: 'Camila conductora', email: preview.recipientEmail, roles: ['DRIVER'] },
  error: undefined, loadUser: async () => {}, login: async () => {}, logout: async () => {} })) as unknown as AuthenticationStore;
type InvitationContextState = { status: 'selecting' | 'ready'; generation: number; activeContext: unknown; select(selection: { organizationId: string; organizationType: 'COMPANY' | 'THIRD_PARTY' }): Promise<void> };
const contextState = createStore<InvitationContextState>((set, get) => ({ status: 'selecting', generation: 0, activeContext: null,
  async select(selection) { set({ status: 'ready', generation: get().generation + 1, activeContext: { kind: 'ORGANIZATION', organizationId: selection.organizationId, organizationType: selection.organizationType } }); } }));
const context = Object.assign(contextState, { capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => contextState.getState().status === 'ready', release: () => {} }), register: () => () => {} }) as unknown as ContextStore;const authorization = createStore(() => ({ status: 'ready' as const, scope, snapshot: null, expiresAt: Number.MAX_SAFE_INTEGER, has: (permission: string) => permission === 'drivers:read' })) as unknown as AuthorizationStore;
let driver: DriverDto | null = null;
let receivedStatus: 'PENDING' | 'ACCEPTED' = 'PENDING';
const provisionDriver = () => {
  driver = { driver: { id: '1123456789abcdef01234567', thirdPartyId: scope.thirdPartyId!, status: 'ACTIVE', version: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    identity: { name: 'Camila Conductora', documentType: 'CC', documentNumber: '87654321', email: preview.recipientEmail } };
};
const driverApi: DriverApi = {
  listDrivers: async () => ({ items: driver ? [driver] : [], page: 1, pageSize: 20, total: driver ? 1 : 0 }),
  getDriver: async () => { if (!driver) throw new Error('driver not found'); return driver; },
  setDriverStatus: async (_scope, _id, _version, status) => { if (!driver) throw new Error('driver not found'); driver = { ...driver, driver: { ...driver.driver, status, version: driver.driver.version + 1 } }; return driver; },
};
const invitationApi = {
  preview: async () => preview,
  accept: async () => {
    provisionDriver();
    return { invitation: acceptedInvitation, membershipId: 'membership-driver-1', membershipRevision: 1 };
  },
  received: async () => ({ items: receivedStatus === 'PENDING' ? [receivedInvitation] : [], page: 1, pageSize: 20, total: receivedStatus === 'PENDING' ? 1 : 0 }),
  acceptReceived: async () => {
    receivedStatus = 'ACCEPTED';
    provisionDriver();
    return { invitation: acceptedInvitation, membershipId: 'membership-driver-1', membershipRevision: 1 };
  },
} as unknown as InvitationApi;
const initialPath = new URLSearchParams(window.location.search).get('screen') === 'received' ? '/invitations/received' : '/invitations/accept';
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><MemoryRouter initialEntries={[initialPath]}>
  <AppLayout navigation={<Stack><Button component={Link} to="/invitations/accept">Invitación</Button><Button component={Link} to="/drivers">Conductores</Button></Stack>} account={<Avatar>DR</Avatar>}>
    <RouteHeadingFocus />
    <Routes>
      <Route path="/invitations/accept" element={<InvitationAcceptancePage api={invitationApi} authentication={authentication} context={context} />} />
      <Route path="/invitations/received" element={<ReceivedInvitationsPage api={invitationApi} context={context} />} />
      <Route path="/drivers" element={<FleetResourcePage resource="drivers" api={driverApi} context={context} authorization={authorization} />} />
      <Route path="/drivers/:id" element={<FleetResourcePage resource="drivers" api={driverApi} context={context} authorization={authorization} />} />
    </Routes>
  </AppLayout>
</MemoryRouter></ThemeProvider>);
