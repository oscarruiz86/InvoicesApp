import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router';
import { Alert, Button, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope, PermissionsSnapshot } from '@/modules/authentication/domain/permissions';
import { createContextPreference } from '@/modules/organization-context/infrastructure/context-preference';
import type { ContextApi } from '@/modules/organization-context/application/context-ports';
import { createContextStore, type ContextStore } from '@/modules/organization-context/presentation/context-store';
import { OrganizationSelectionPage, OrganizationSelector } from '@/modules/organization-context/presentation/organization-selector';
import { scopeOf, type ContextSelection, type ResolvedContext } from '@/modules/organization-context/domain/context';
import { theme } from '@/shared/theme/theme';
import { ApplicationError } from '@/shared/application/application-error';

const destinations = [
  { organizationId: 'aaaaaaaaaaaaaaaaaaaaaaaa', organizationType: 'COMPANY' as const, organizationName: 'Empresa A', roles: ['COMPANY_ADMIN' as const] },
  { organizationId: 'bbbbbbbbbbbbbbbbbbbbbbbb', organizationType: 'COMPANY' as const, organizationName: 'Empresa B', roles: ['COMPANY_ADMIN' as const] },
  { organizationId: 'cccccccccccccccccccccccc', organizationType: 'COMPANY' as const, organizationName: 'Empresa C', roles: ['COMPANY_ADMIN' as const] },
];
const snapshot = (scope: PermissionScope): PermissionsSnapshot => ({ subject: 'browser-user', scope, roles: ['COMPANY_ADMIN'], permissions: ['companies:read'],
  policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 });
const resolveContext = (selection: ContextSelection): ResolvedContext => {
  if (selection.kind === 'GLOBAL') throw new Error('unexpected global context');
  const destination = destinations.find(value => value.organizationId === selection.organizationId);
  if (!destination) throw new Error('unknown destination');
  return { kind: 'ORGANIZATION', ...destination, authorization: snapshot(scopeOf(selection)) };
};
const api: ContextApi = {
  async available() { return { organizations: destinations, globalAvailable: false }; },
  async resolve(selection) {
    if (selection.kind !== 'GLOBAL' && new URLSearchParams(location.search).get('reject') === selection.organizationId) {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw new ApplicationError('FORBIDDEN');
    }
    if (selection.kind !== 'GLOBAL' && new URLSearchParams(location.search).get('late') === selection.organizationId) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return resolveContext(selection);
  },
};

let session: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const sessionListeners = new Set<(state: SessionSnapshot) => void>();
const sessionPort: SessionPort = { snapshot: () => session, subscribe(listener) { sessionListeners.add(listener); return () => sessionListeners.delete(listener); },
  initialize: async () => {}, login: async () => {}, logout: async () => { session = { status: 'anonymous' }; sessionListeners.forEach(listener => listener(session)); },
  invalidate() { session = { status: 'error', error: 'SESSION_EXPIRED' }; sessionListeners.forEach(listener => listener(session)); } };
const authentication = createAuthenticationStore(createAuthentication(sessionPort, { async read() {
  return { id: 'browser-user', name: 'Usuario de prueba', username: 'browser-user', email: null, roles: ['COMPANY_ADMIN'] };
} }));
const authorization = createAuthorizationStore(async scope => snapshot(scope), sessionPort, { automatic: false, visible: () => true });
const channel = { publish() {}, subscribe() { return () => {}; }, dispose() {} };
const context: ContextStore = createContextStore({ api, preference: createContextPreference(), authentication, authorization, channel,
  invalidateSession: () => sessionPort.invalidate(), confirmDiscard: async () => true });

function SessionView() {
  const [privateData, setPrivateData] = useState<string | null>(null);
  useEffect(() => context.register({ dirty: () => false, clear: () => setPrivateData(null) }), []);
  useEffect(() => {
    const update = () => {
      const state = context.getState();
      setPrivateData(state.status === 'ready' && state.activeContext?.kind === 'ORGANIZATION' ? `${state.activeContext.organizationName}: datos privados` : null);
    };
    update(); return context.subscribe(update);
  }, []);
  return <Stack spacing={2} sx={{ p: 3 }}>
    <Typography component="h1">Sesión</Typography><OrganizationSelector store={context} />
    {privateData && <Typography>{privateData}</Typography>}
    <Button onClick={() => {
      const b = destinations[1], c = destinations[2];
      const pendingB = context.getState().select({ kind: 'ORGANIZATION', ...b });
      void context.getState().select({ kind: 'ORGANIZATION', ...c }); void pendingB;
    }}>Probar respuesta tardía B frente a C</Button>
    <Button onClick={() => void context.getState().select({ kind: 'ORGANIZATION', ...destinations[0] })}>Probar contexto revocado A</Button>
    {context.getState().status === 'error' && <Alert severity="error">Contexto rechazado</Alert>}
  </Stack>;
}

function App() {
  useEffect(() => { void authentication.getState().loadUser(); return () => { context.dispose(); authorization.dispose(); }; }, []);
  return <ThemeProvider theme={theme}><CssBaseline /><HashRouter><Routes>
    <Route path="/organizations/select" element={<OrganizationSelectionPage store={context} authentication={authentication} />} />
    <Route path="/session" element={<SessionView />} />
    <Route path="*" element={<OrganizationSelectionPage store={context} authentication={authentication} />} />
  </Routes></HashRouter></ThemeProvider>;
}

createRoot(document.getElementById('root')!).render(<App />);
