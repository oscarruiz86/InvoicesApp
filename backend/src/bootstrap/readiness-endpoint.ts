import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { keycloakConfiguration } from '@/modules/identity/infrastructure/keycloak/configuration';
import { createReadinessHandler, readinessTimeout } from '@/shared/presentation/http/readiness';

export const readinessEndpoint = createReadinessHandler(async () => {
  const environment = process.env;
  await Promise.race([connectMongo({ file: String(environment.MONGODB_URI_FILE ?? ''), uri: String(environment.MONGODB_URI ?? '') }), readinessTimeout(4000)]);
  const identity = keycloakConfiguration({ KEYCLOAK_ISSUER_URL: environment.KEYCLOAK_ISSUER_URL,
    KEYCLOAK_AUDIENCE: environment.KEYCLOAK_AUDIENCE, KEYCLOAK_JWKS_URL: environment.KEYCLOAK_JWKS_URL });
  if (identity) {
    const response = await Promise.race([fetch(identity.jwksUrl, { signal: AbortSignal.timeout(3000), cache: 'no-store' }), readinessTimeout(3500)]);
    if (!response.ok) throw new Error('IDENTITY_UNAVAILABLE');
  }
});
