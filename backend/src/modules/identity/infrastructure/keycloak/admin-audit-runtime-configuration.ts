export type KeycloakAdminAuditRuntimeConfiguration =
  | { readonly mode: 'disabled' }
  | { readonly mode: 'local'; readonly mongoUri: string; readonly baseUrl: string; readonly realm: string; readonly clientId: string; readonly secretFile: string; readonly writerModule: string }
  | { readonly mode: 'production'; readonly mongoUriFile: string; readonly baseUrl: string; readonly realm: string; readonly clientId: string; readonly secretFile: string; readonly writerModule: string };

const productionAuditKeys = [
  'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED', 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_BASE_URL',
  'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_REALM', 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_ID',
  'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET_FILE', 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET',
  'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_WRITER_MODULE',
] as const;
const localKeys = ['KEYCLOAK_ADMIN_AUDIT_BASE_URL', 'KEYCLOAK_ADMIN_AUDIT_REALM', 'KEYCLOAK_ADMIN_AUDIT_CLIENT_ID',
  'KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE', 'KEYCLOAK_ADMIN_AUDIT_WRITER_MODULE', 'MONGODB_URI'] as const;
const value = (source: Record<string, unknown>, key: string) => typeof source[key] === 'string' ? (source[key] as string).trim() : '';
const validIdentifier = (input: string) => /^[A-Za-z0-9._-]{1,128}$/.test(input);
function validBaseUrl(input: string, production: boolean): boolean {
  try {
    const url = new URL(input);
    return (production ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol))
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function resolveKeycloakAdminAuditRuntimeConfiguration(source: Record<string, unknown>): KeycloakAdminAuditRuntimeConfiguration {
  const productionMode = source.NODE_ENV === 'production';
  const hasProductionSetting = productionAuditKeys.some(key => value(source, key) !== '');
  const hasLocalSetting = localKeys.some(key => value(source, key) !== '');

  if (productionMode) {
    if (!hasProductionSetting && !hasLocalSetting) return { mode: 'disabled' };
    if (hasLocalSetting) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
    const enabled = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED');
    if (enabled === 'false' && productionAuditKeys.filter(key => key !== 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED').every(key => value(source, key) === ''))
      return { mode: 'disabled' };
    const baseUrl = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_BASE_URL');
    const realm = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_REALM');
    const clientId = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_ID');
    const secretFile = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET_FILE');
    const writerModule = value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_WRITER_MODULE');
    const mongoUriFile = value(source, 'MONGODB_URI_FILE');
    if (enabled !== 'true' || !baseUrl || !validBaseUrl(baseUrl, true) || !validIdentifier(realm) || !validIdentifier(clientId)
      || !secretFile || !writerModule || !mongoUriFile || value(source, 'KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET'))
      throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
    return { mode: 'production', mongoUriFile, baseUrl, realm, clientId, secretFile, writerModule };
  }

  if (hasProductionSetting) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
  if (value(source, 'KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET')) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
  const mongoUri = value(source, 'MONGODB_URI');
  const baseUrl = value(source, 'KEYCLOAK_ADMIN_AUDIT_BASE_URL');
  const realm = value(source, 'KEYCLOAK_ADMIN_AUDIT_REALM');
  const clientId = value(source, 'KEYCLOAK_ADMIN_AUDIT_CLIENT_ID');
  const secretFile = value(source, 'KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE');
  const writerModule = value(source, 'KEYCLOAK_ADMIN_AUDIT_WRITER_MODULE');
  if (!mongoUri || !baseUrl || !validBaseUrl(baseUrl, false) || !validIdentifier(realm) || !validIdentifier(clientId) || !secretFile || !writerModule)
    throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_MISSING');
  return { mode: 'local', mongoUri, baseUrl, realm, clientId, secretFile, writerModule };
}
