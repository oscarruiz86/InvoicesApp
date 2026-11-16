export type KeycloakConfiguration = Readonly<{ issuer: string; audience: string; jwksUrl: string }>;

/** Reading validated configuration does not connect to the identity provider. */
export function keycloakConfiguration(environment: { KEYCLOAK_ISSUER_URL?: unknown; KEYCLOAK_AUDIENCE?: unknown; KEYCLOAK_JWKS_URL?: unknown }): KeycloakConfiguration | null {
  if (typeof environment.KEYCLOAK_ISSUER_URL !== 'string' || typeof environment.KEYCLOAK_AUDIENCE !== 'string') return null;
  return { issuer: environment.KEYCLOAK_ISSUER_URL, audience: environment.KEYCLOAK_AUDIENCE, jwksUrl: typeof environment.KEYCLOAK_JWKS_URL === 'string' ? environment.KEYCLOAK_JWKS_URL : `${environment.KEYCLOAK_ISSUER_URL.replace(/\/$/, '')}/protocol/openid-connect/certs` };
}
