import { z } from 'zod';
import { ConfigurationError } from '@/shared/application/configuration-error';

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === '' ? undefined : value, schema.optional());
const identityUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
});
const publicOrigin = z.string().url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
});
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: optional(z.string().trim().refine(value => {
    try { const url = new URL(value); return ['mongodb:', 'mongodb+srv:'].includes(url.protocol) && Boolean(url.hostname); }
    catch { return false; }
  })),
  MONGODB_URI_FILE: optional(z.string().trim().min(1)),
  INVOICE_IMAGE_STORAGE_PROVIDER: optional(z.enum(['local'])),
  INVOICE_IMAGE_STORAGE_LOCAL_ROOT: optional(z.string().trim().min(1)),
  INVOICE_IMAGE_STORAGE_COMPANY_ID: optional(z.string().trim().regex(/^[a-f\d]{24}$/i)),
  KEYCLOAK_DIRECTORY_CLIENT_ID: optional(z.string().trim().min(1)),
  KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE: optional(z.string().trim().min(1)),
  KEYCLOAK_DIRECTORY_CLIENT_SECRET: optional(z.string().min(1)),
  KEYCLOAK_ISSUER_URL: optional(identityUrl),
  KEYCLOAK_AUDIENCE: optional(z.string().trim().min(1)),
  KEYCLOAK_JWKS_URL: optional(identityUrl),
  KEYCLOAK_DIRECTORY_ISSUER_URL: optional(identityUrl),
  INVITATION_PUBLIC_ORIGIN: optional(publicOrigin),
  INVITATION_TTL_HOURS: z.preprocess(value => value === '' || value === undefined ? 72 : Number(value), z.number().int().min(1).max(720)),
  SMTP_ENABLED: z.preprocess(value => value === true || value === 'true' ? true : value === false || value === 'false' || value === '' || value === undefined ? false : value, z.boolean()).default(false),
  SMTP_HOST: optional(z.string().trim().min(1)),
  SMTP_PORT: z.preprocess(value => value === '' || value === undefined ? undefined : Number(value), z.number().int().min(1).max(65535).optional()),
  SMTP_USERNAME: optional(z.string().trim().min(1)),
  SMTP_PASSWORD_FILE: optional(z.string().trim().min(1)),
  SMTP_TLS_MODE: optional(z.enum(['implicit', 'starttls', 'plain'])),
  SMTP_FROM_ADDRESS: optional(z.string().trim().email()),
  SMTP_FROM_NAME: z.preprocess(value => value === '' || value === undefined ? 'Invoices App' : String(value), z.string().trim().min(1).max(128)),
  SMTP_TIMEOUT_MS: z.preprocess(value => value === '' || value === undefined ? 10000 : Number(value), z.number().int().min(100).max(120000)),
  NOTIFICATION_PAYLOAD_KEY_FILE: optional(z.string().trim().min(1)),
  NOTIFICATION_PAYLOAD_KEY_FILES: optional(z.string().trim().min(1)),
  NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION: z.preprocess(value => value === '' || value === undefined ? 1 : Number(value), z.number().int().min(1).max(255)),
}).superRefine((value, context) => {
  const invoiceStorageConfigured = Boolean(value.INVOICE_IMAGE_STORAGE_PROVIDER);
  if (invoiceStorageConfigured && (!value.INVOICE_IMAGE_STORAGE_LOCAL_ROOT || !value.INVOICE_IMAGE_STORAGE_COMPANY_ID)) {
    if (!value.INVOICE_IMAGE_STORAGE_LOCAL_ROOT) context.addIssue({ code: 'custom', path: ['INVOICE_IMAGE_STORAGE_LOCAL_ROOT'], message: 'La raíz local es requerida para el proveedor local' });
    if (!value.INVOICE_IMAGE_STORAGE_COMPANY_ID) context.addIssue({ code: 'custom', path: ['INVOICE_IMAGE_STORAGE_COMPANY_ID'], message: 'El namespace es requerido para el proveedor local' });
  }
  if (value.INVOICE_IMAGE_STORAGE_LOCAL_ROOT && !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value.INVOICE_IMAGE_STORAGE_LOCAL_ROOT))
    context.addIssue({ code: 'custom', path: ['INVOICE_IMAGE_STORAGE_LOCAL_ROOT'], message: 'La raíz local debe ser absoluta' });
  if (Boolean(value.INVOICE_IMAGE_STORAGE_LOCAL_ROOT) !== Boolean(value.INVOICE_IMAGE_STORAGE_PROVIDER))
    context.addIssue({ code: 'custom', path: ['INVOICE_IMAGE_STORAGE_PROVIDER'], message: 'Configure proveedor y raíz local juntos' });
  if (value.NODE_ENV === 'production') {
    if (!value.MONGODB_URI_FILE || value.MONGODB_URI) context.addIssue({ code: 'custom', path: ['MONGODB_URI_FILE'], message: 'Producción requiere solo MONGODB_URI_FILE' });
    if (value.KEYCLOAK_DIRECTORY_CLIENT_SECRET || value.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE && !value.KEYCLOAK_DIRECTORY_CLIENT_ID)
      context.addIssue({ code: 'custom', path: ['KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE'], message: 'Credencial de directorio inválida' });
  }
  if (value.MONGODB_URI_FILE && value.MONGODB_URI) context.addIssue({ code: 'custom', path: ['MONGODB_URI_FILE'], message: 'Configure Mongo mediante una sola fuente' });
  if (value.KEYCLOAK_DIRECTORY_CLIENT_SECRET && value.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE)
    context.addIssue({ code: 'custom', path: ['KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE'], message: 'Configure el secreto de directorio mediante una sola fuente' });
  if (value.NODE_ENV !== 'production' && !value.MONGODB_URI && !value.MONGODB_URI_FILE)
    context.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'Se requiere configuración Mongo' });
  if (value.MONGODB_URI) {
    try {
      const uri = new URL(value.MONGODB_URI);
      const localMongoHosts = ['localhost', '127.0.0.1', '[::1]', 'mongodb'];
      if (value.NODE_ENV === 'production' || uri.username || uri.password || !localMongoHosts.includes(uri.hostname))
        context.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'La URI inline solo se admite sin credenciales en Mongo local fuera de producción' });
    } catch { /* The schema field reports the invalid URI without exposing its value. */ }
  }
  if (value.SMTP_ENABLED) {
    for (const field of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_TLS_MODE', 'SMTP_FROM_ADDRESS', 'INVITATION_PUBLIC_ORIGIN'] as const)
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: 'Configuración SMTP/notificaciones incompleta' });
    if (value.SMTP_USERNAME && !value.SMTP_PASSWORD_FILE) context.addIssue({ code: 'custom', path: ['SMTP_PASSWORD_FILE'], message: 'Se requiere el archivo secreto de autenticación SMTP' });
    if (!value.NOTIFICATION_PAYLOAD_KEY_FILE && !value.NOTIFICATION_PAYLOAD_KEY_FILES) context.addIssue({ code: 'custom', path: ['NOTIFICATION_PAYLOAD_KEY_FILES'], message: 'Se requiere al menos una clave AES montada' });
    if (value.SMTP_TLS_MODE === 'plain') {
      const localHosts = ['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal'];
      if (!['development', 'test'].includes(value.NODE_ENV) || !value.SMTP_HOST || !localHosts.includes(value.SMTP_HOST.toLowerCase()))
        context.addIssue({ code: 'custom', path: ['SMTP_TLS_MODE'], message: 'SMTP sin TLS solo se permite contra un host local en desarrollo o pruebas' });
    }
  }
  if (typeof value.INVITATION_PUBLIC_ORIGIN === 'string') {
    const url = new URL(value.INVITATION_PUBLIC_ORIGIN);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (value.NODE_ENV === 'production' && url.protocol !== 'https:') context.addIssue({ code: 'custom', path: ['INVITATION_PUBLIC_ORIGIN'], message: 'Se requiere HTTPS en producción' });
    if (value.NODE_ENV !== 'production' && url.protocol !== 'https:' && !local) context.addIssue({ code: 'custom', path: ['INVITATION_PUBLIC_ORIGIN'], message: 'Se requiere HTTPS fuera del entorno local' });
  }
  if (Boolean(value.KEYCLOAK_ISSUER_URL) !== Boolean(value.KEYCLOAK_AUDIENCE)) {
    context.addIssue({ code: 'custom', path: ['KEYCLOAK_ISSUER_URL'], message: 'Se requieren issuer y audiencia juntos' });
    context.addIssue({ code: 'custom', path: ['KEYCLOAK_AUDIENCE'], message: 'Se requieren issuer y audiencia juntos' });
  }
  if (value.KEYCLOAK_JWKS_URL && !value.KEYCLOAK_ISSUER_URL) context.addIssue({ code: 'custom', path: ['KEYCLOAK_JWKS_URL'], message: 'Se requiere configuración de identidad completa' });
  if (value.KEYCLOAK_DIRECTORY_ISSUER_URL && !value.KEYCLOAK_ISSUER_URL) context.addIssue({ code: 'custom', path: ['KEYCLOAK_DIRECTORY_ISSUER_URL'], message: 'Se requiere configuración de identidad completa' });
  if (typeof value.KEYCLOAK_DIRECTORY_ISSUER_URL === 'string' && typeof value.KEYCLOAK_ISSUER_URL === 'string'
    && new URL(value.KEYCLOAK_DIRECTORY_ISSUER_URL).pathname !== new URL(value.KEYCLOAK_ISSUER_URL).pathname) {
    context.addIssue({ code: 'custom', path: ['KEYCLOAK_DIRECTORY_ISSUER_URL'], message: 'El destino interno debe usar el mismo realm' });
  }
  for (const field of ['KEYCLOAK_ISSUER_URL', 'KEYCLOAK_JWKS_URL', 'KEYCLOAK_DIRECTORY_ISSUER_URL'] as const) {
    const address = value[field];
    if (typeof address !== 'string') continue;
    const url = new URL(address);
    const local = ['localhost', '127.0.0.1', '[::1]', 'keycloak'].includes(url.hostname);
    if (url.protocol !== 'https:' && (value.NODE_ENV === 'production' || !local)) context.addIssue({ code: 'custom', path: [field], message: 'Se requiere HTTPS fuera del entorno local' });
  }
});

export function readServerEnvironment(source: Record<string, unknown> = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) throw new ConfigurationError([...new Set(result.error.issues.map(issue => String(issue.path[0])))]);
  const keyFiles: Record<number, string> = {};

  if (result.data.NOTIFICATION_PAYLOAD_KEY_FILES) {
    for (const entry of result.data.NOTIFICATION_PAYLOAD_KEY_FILES.split(';')) {
      const match = /^(\d+)=(.+)$/.exec(entry.trim());
      if (!match) throw new ConfigurationError(['NOTIFICATION_PAYLOAD_KEY_FILES']);
      const version = Number(match[1]);
      if (version < 1 || version > 255 || keyFiles[version]) throw new ConfigurationError(['NOTIFICATION_PAYLOAD_KEY_FILES']);
      keyFiles[version] = match[2].trim();
    }
  }
  if (!keyFiles[1] && result.data.NOTIFICATION_PAYLOAD_KEY_FILE) keyFiles[1] = result.data.NOTIFICATION_PAYLOAD_KEY_FILE;
  if (result.data.SMTP_ENABLED && !keyFiles[result.data.NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION])
    throw new ConfigurationError(['NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION']);
  return { ...result.data, NOTIFICATION_PAYLOAD_KEYRING: { activeVersion: result.data.NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION, keyFiles } };
}
