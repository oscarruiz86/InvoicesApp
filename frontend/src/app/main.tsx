import { createRoot } from 'react-dom/client';
import { Alert, CssBaseline, ThemeProvider, Typography, Stack } from '@mui/material';
import { App } from './app';
import { theme } from '@/shared/theme/theme';
import { readClientEnvironment } from '@/shared/infrastructure/config/client-environment';
import { createHttpClient } from '@/shared/infrastructure/http/http-client';
import { createReadHealth } from '@/modules/home/application/read-health';
import { createHttpHealthAdapter } from '@/modules/home/infrastructure/http-health-adapter';
import { createHealthStore } from '@/modules/home/presentation/health-store';
import { errorMessage } from '@/shared/components/error-messages';
import { readOidcConfiguration } from '@/modules/authentication/infrastructure/oidc-configuration';
import { createKeycloakSession } from '@/modules/authentication/infrastructure/keycloak-session';
import { createHttpCurrentUser } from '@/modules/authentication/infrastructure/http-current-user';
import { createAuthentication } from '@/modules/authentication/application/authentication';
import { createAuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import { createHttpPermissions } from '@/modules/authentication/infrastructure/http-permissions';
import { createReadPermissions } from '@/modules/authentication/application/read-permissions';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { createHttpContexts } from '@/modules/organization-context/infrastructure/http-contexts';
import { createContextPreference, createSessionCleanupChannel } from '@/modules/organization-context/infrastructure/context-preference';
import { createContextUseCases } from '@/modules/organization-context/application/context-ports';
import { createContextStore } from '@/modules/organization-context/presentation/context-store';
import { createCompanyApi } from '@/modules/company-management/infrastructure/http-companies';
import { createThirdPartyApi } from '@/modules/third-party-management/infrastructure/http-third-parties';
import { createInvitationApi } from '@/modules/user-invitations/infrastructure/http-invitation-api';
import { createHttpRolePolicy } from '@/modules/role-management/infrastructure/http-role-policy';
import { createVehicleApi } from '@/modules/fleet/infrastructure/http-vehicles';
import { createDriverApi } from '@/modules/fleet/infrastructure/http-drivers';
import { createAssignmentApi } from '@/modules/fleet/infrastructure/http-assignments';
import { createRolePolicyApi } from '@/modules/role-management/application/role-policy-api';
import { createInvoiceApi } from '@/modules/invoices/infrastructure/http-invoices';
import { createHttpParameters } from '@/modules/parameter-management/infrastructure/http-parameters';
import { createHttpCatalogApi } from '@/modules/parameter-management/infrastructure/http-catalogs';
import { offlineInvoiceQueue } from '@/modules/invoices/infrastructure/offline-invoice-queue';
import { findValidOfflineCredential, verifyOfflineCredential } from '@/modules/invoices/infrastructure/offline-credential';
import { OfflineInvoiceCapturePage } from '@/modules/invoices/presentation/offline-invoice-capture-page';

function clientEnvironment() {
  let testJwks: string | undefined;
  if (__OFFLINE_SHELL_E2E__) { try { testJwks = localStorage.getItem('offline-shell-e2e-jwks') ?? undefined; } catch { /* E2E overrides are optional outside the browser harness. */ } }
  return readClientEnvironment({ ...import.meta.env, VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: testJwks ?? import.meta.env.VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS });
}

async function composeOfflineCapture() {
  const environment = clientEnvironment();
  const valid = await findValidOfflineCredential(await offlineInvoiceQueue.listCredentials(), environment.offlineCredentialPublicJwks);
  if (valid && environment.offlineCredentialPublicJwks.length) return <ThemeProvider theme={theme}><CssBaseline />
    <OfflineInvoiceCapturePage ticket={valid.record} claims={valid.claims} publicJwks={environment.offlineCredentialPublicJwks} offlineQueue={offlineInvoiceQueue} verifyCredential={verifyOfflineCredential}
      loadDecoder={() => import('@/modules/invoices/infrastructure/qr-scanner-adapter').then(adapter => adapter.createQrScannerAdapter())} />
  </ThemeProvider>;
  return <ThemeProvider theme={theme}><CssBaseline /><Stack spacing={2} sx={{ maxWidth: 520, mx: 'auto', mt: 8, p: 3 }}>
    <Typography variant="h5">Captura offline no disponible</Typography>
    <Alert severity="warning">No encontramos una credencial vigente para este dispositivo. Conéctate e inicia sesión antes de salir a una zona sin cobertura.</Alert>
  </Stack></ThemeProvider>;
}

async function composeApplication() {
  try {
    const environment = clientEnvironment();
    if (!navigator.onLine) return composeOfflineCapture();
    const read = createReadHealth(createHttpHealthAdapter(createHttpClient(environment.apiBaseUrl)));
    let oidc = null;
    try { oidc = readOidcConfiguration(import.meta.env); } catch { /* The public shell remains usable; authentication reports configuration failure. */ }
    const session = createKeycloakSession(oidc);
    const http = createProtectedHttp(environment.apiBaseUrl, session, session);
    const authentication = createAuthenticationStore(createAuthentication(session, createHttpCurrentUser(environment.apiBaseUrl, session, session, undefined, undefined, http)));
    const authorization = createAuthorizationStore(createReadPermissions(createHttpPermissions(http)), session);
    const organizationContext = createContextStore({ api: createContextUseCases(createHttpContexts(http)), preference: createContextPreference(), authentication, authorization,
      channel: createSessionCleanupChannel(), invalidateSession: () => session.invalidate(),
      confirmDiscard: async () => window.confirm('Hay información sin guardar. ¿Quieres descartarla y cambiar de contexto?') });
    const unsubscribeForbidden = http.subscribeForbidden(() => { void authorization.getState().refresh(); });
    import.meta.hot?.dispose(() => { unsubscribeForbidden(); organizationContext.dispose(); authorization.dispose(); http.dispose(); });
    await authentication.getState().initialize();
    if (!navigator.onLine) return composeOfflineCapture();
    const rolePolicy = createRolePolicyApi(createHttpRolePolicy(http));
    return <App store={createHealthStore(read)} authentication={authentication} authorization={authorization} organizationContext={organizationContext} companies={createCompanyApi(http)} thirdParties={createThirdPartyApi(http)} invitations={createInvitationApi(http)} rolePolicy={rolePolicy} fleet={createDriverApi(http)} vehicles={createVehicleApi(http)} assignmentApi={createAssignmentApi(http)} invoices={createInvoiceApi(http)} parameters={createHttpParameters(http)} catalogs={createHttpCatalogApi(http)} offlineCredentialPublicJwks={environment.offlineCredentialPublicJwks}
      offlineQueue={offlineInvoiceQueue} verifyOfflineCredential={verifyOfflineCredential} />;
  } catch {
    return <ThemeProvider theme={theme}><CssBaseline /><Alert severity="error">{errorMessage('CONFIGURATION')}</Alert></ThemeProvider>;
  }
}
const root = createRoot(document.getElementById('root')!);
if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
const initializing = <ThemeProvider theme={theme}><CssBaseline /><Alert severity="info">Inicializando sesión…</Alert></ThemeProvider>;
let renderGeneration = 0;
function showOfflineCapture() {
  const generation = ++renderGeneration;
  root.render(initializing);
  void composeOfflineCapture().then(app => {
    if (generation === renderGeneration && !navigator.onLine) root.render(app);
  }).catch(() => {
    if (generation === renderGeneration && !navigator.onLine) root.render(<ThemeProvider theme={theme}><CssBaseline /><Alert severity="error">No se pudo abrir la captura offline. Conéctate e inténtalo de nuevo.</Alert></ThemeProvider>);
  });
}
function showOnlineApplication() {
  const generation = ++renderGeneration;
  root.render(initializing);
  void composeApplication().then(app => {
    if (generation !== renderGeneration) return;
    if (!navigator.onLine) { showOfflineCapture(); return; }
    root.render(app);
  });
}
window.addEventListener('offline', showOfflineCapture);
window.addEventListener('online', () => {
  renderGeneration++;
  window.location.reload();
});
if (navigator.onLine) showOnlineApplication();
else showOfflineCapture();
