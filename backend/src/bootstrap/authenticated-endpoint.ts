import type { AuthenticatedActor, IdentityVerifier } from '@/modules/identity/application/identity-verifier';
import { keycloakConfiguration } from '@/modules/identity/infrastructure/keycloak/configuration';
import { createJwtIdentityVerifier } from '@/modules/identity/infrastructure/keycloak/jwt-identity-verifier';
import { authenticatedHandler } from '@/modules/identity/presentation/authenticated-handler';
import { ConfigurationError } from '@/shared/application/configuration-error';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { errorResponse } from '@/shared/presentation/http/errors';

let cached: { key: string; verifier: IdentityVerifier } | undefined;
export function authenticatedEndpoint(action: (actor: AuthenticatedActor, request: Request) => Response | Promise<Response>) {
  return async (request: Request) => {
    try {
      const configuration = keycloakConfiguration(readServerEnvironment());
      if (!configuration) throw new ConfigurationError(['KEYCLOAK_ISSUER_URL', 'KEYCLOAK_AUDIENCE']);
      const key = JSON.stringify(configuration);
      if (cached?.key !== key) cached = { key, verifier: createJwtIdentityVerifier(configuration, {
        diagnostic: category => { if (category === 'JWKS_UNAVAILABLE') console.error('Identidad: claves públicas no disponibles'); },
      }) };
      return await authenticatedHandler(cached.verifier, action)(request);
    } catch (error) { return errorResponse(error); }
  };
}
