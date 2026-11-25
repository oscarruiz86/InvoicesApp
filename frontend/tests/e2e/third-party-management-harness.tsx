import { createRoot } from 'react-dom/client';
import { createStore } from 'zustand/vanilla';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { Avatar, Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { AppLayout } from '@/shared/components/app-layout';
import { theme } from '@/shared/theme/theme';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { ThirdPartyApi } from '@/modules/third-party-management/application/third-party-api';
import type { ThirdParty, ThirdPartyRecord, ThirdPartyRelationship } from '@/modules/third-party-management/domain/third-party';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ThirdPartyPage } from '@/modules/third-party-management/presentation/third-party-page';

const scope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const permissions = ['third-parties:read', 'third-parties:create', 'third-parties:update', 'third-parties:deactivate'] as const;
const snapshot = (target: PermissionScope) => ({ subject: 'browser-test', scope: target, roles: ['APP_ADMIN'] as const, permissions, policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; } };
const authorization = createAuthorizationStore(async target => snapshot(target), session, { automatic: false, visible: () => true });
void authorization.getState().setContext(scope);

let profile: ThirdParty = { id: 'b'.repeat(24), documentType: 'NIT', documentNumber: '000123', verificationDigit: null, businessName: 'Tercero Andino', tradeName: null, email: 'contact@example.invalid', phone: null, address: null, country: 'Colombia', department: 'Cundinamarca', city: 'Bogotá', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'browser-test', updatedBy: null };
let version = 1;
let relationship: ThirdPartyRelationship | null = null;
const record = (): ThirdPartyRecord => ({ thirdParty: profile, version: String(version), relationship: null });
const api: ThirdPartyApi = {
  list: async () => ({ items: [record()], page: 1, pageSize: 20, total: 1 }),
  get: async () => record(),
  create: async (_scope, input) => { profile = { ...profile, ...input } as ThirdParty; version++; return record(); },
  update: async (_scope, _id, _expectedVersion, changes) => { profile = { ...profile, ...changes } as ThirdParty; version++; return record(); },
  status: async (_scope, _id, _expectedVersion, status) => { profile = { ...profile, status }; version++; return record(); },
  getRelationship: async () => relationship,
  relationship: async (_scope, _id, targetCompany, _expectedVersion, status) => {
    relationship = { companyId: targetCompany, thirdPartyId: profile.id, status, version: String(Number(relationship?.version ?? 0) + 1), createdAt: null, updatedAt: new Date().toISOString(), createdBy: 'browser-test', updatedBy: 'browser-test' };
    version++; return { ...record(), relationship };
  },
};
const contextState = createStore(() => ({ status: 'ready' as const, activeContext: null, availableContexts: { organizations: [], globalAvailable: true }, generation: 0, persistent: false,
  initialize: async () => {}, openSelector: async () => false, select: async () => {}, clear: async () => {} }));
const context = Object.assign(contextState, { register: () => () => {}, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} }) }) as unknown as ContextStore;
const initialPath = new URLSearchParams(window.location.search).get('screen') === 'detail' ? '/third-parties/' + 'b'.repeat(24) : '/third-parties';

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><MemoryRouter initialEntries={[initialPath]}>
  <AppLayout navigation={<Stack><Button component={Link} to="/">Inicio</Button><Button component={Link} to="/third-parties">Terceros</Button></Stack>} account={<Avatar>TP</Avatar>}>
    <Routes>
      {(['list', 'create', 'detail', 'edit'] as const).map(mode => <Route key={mode} path={mode === 'list' ? '/third-parties' : mode === 'create' ? '/third-parties/new' : mode === 'detail' ? '/third-parties/:id' : '/third-parties/:id/edit'} element={<ThirdPartyPage api={api} context={context} authorization={authorization} mode={mode} />} />)}
    </Routes>
  </AppLayout>
</MemoryRouter></ThemeProvider>);
