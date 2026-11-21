import { createRoot } from 'react-dom/client';
import { Alert, CssBaseline, ThemeProvider } from '@mui/material';
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

async function composeApplication() {
  try {
    const environment = readClientEnvironment(import.meta.env);
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
    const rolePolicy = createRolePolicyApi(createHttpRolePolicy(http));
    return <App store={createHealthStore(read)} authentication={authentication} authorization={authorization} organizationContext={organizationContext} companies={createCompanyApi(http)} thirdParties={createThirdPartyApi(http)} invitations={createInvitationApi(http)} rolePolicy={rolePolicy} fleet={createDriverApi(http)} vehicles={createVehicleApi(http)} assignmentApi={createAssignmentApi(http)} invoices={createInvoiceApi(http)} parameters={createHttpParameters(http)} />;
  } catch {
    return <ThemeProvider theme={theme}><CssBaseline /><Alert severity="error">{errorMessage('CONFIGURATION')}</Alert></ThemeProvider>;
  }
}
const root = createRoot(document.getElementById('root')!);
root.render(<ThemeProvider theme={theme}><CssBaseline /><Alert severity="info">Inicializando sesión…</Alert></ThemeProvider>);
void composeApplication().then(app => root.render(app));
