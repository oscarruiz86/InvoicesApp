import { describe, expect, it } from 'vitest';
import { resolveKeycloakAdminAuditRuntimeConfiguration } from '@/modules/identity/infrastructure/keycloak/admin-audit-runtime-configuration';

describe('Keycloak admin audit runtime configuration', () => {
  it('disables the production collector when its opt-in group is absent', () => {
    expect(resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'production', MONGODB_URI_FILE: '/run/secrets/mongodb-uri' })).toEqual({ mode: 'disabled' });
  });

  it('rejects partial production settings without exposing secret values', () => {
    const secret = 'never-log-this-secret';
    expect(() => resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'production',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED: 'true', KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET: secret,
    })).toThrow('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
    try {
      resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'production',
        KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED: 'true', KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET: secret });
    } catch (error) { expect(String(error)).not.toContain(secret); }
  });

  it('accepts a complete HTTPS production group using file-backed secrets only', () => {
    const resolved = resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'production',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED: 'true', KEYCLOAK_ADMIN_AUDIT_PRODUCTION_BASE_URL: 'https://identity.example.test',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_REALM: 'invoices', KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_ID: 'invoices-admin-audit-reader',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET_FILE: '/run/secrets/keycloak-admin-audit-client-secret',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_WRITER_MODULE: '/app/src/modules/audit/infrastructure/mongodb/audit-writer.js',
      MONGODB_URI_FILE: '/run/secrets/mongodb-uri',
    });
    expect(resolved).toMatchObject({ mode: 'production', mongoUriFile: '/run/secrets/mongodb-uri',
      secretFile: '/run/secrets/keycloak-admin-audit-client-secret' });
    expect(JSON.stringify(resolved)).not.toContain('clientSecret');
    expect(JSON.stringify(resolved)).not.toContain('never-log-this-secret');
  });

  it('rejects local Compose settings in production and rejects production settings in local mode', () => {
    expect(() => resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://mongo/db',
      KEYCLOAK_ADMIN_AUDIT_BASE_URL: 'http://keycloak:8080' })).toThrow('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
    expect(() => resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'development',
      KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED: 'true' })).toThrow('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
  });

  it('preserves the existing local Compose variable group', () => {
    expect(resolveKeycloakAdminAuditRuntimeConfiguration({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://mongodb:27017/invoices_app',
      KEYCLOAK_ADMIN_AUDIT_BASE_URL: 'http://keycloak:8080', KEYCLOAK_ADMIN_AUDIT_REALM: 'invoices',
      KEYCLOAK_ADMIN_AUDIT_CLIENT_ID: 'invoices-admin-audit-reader',
      KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE: '/run/secrets/keycloak-admin-audit-client-secret',
      KEYCLOAK_ADMIN_AUDIT_WRITER_MODULE: '/app/audit-writer.ts',
    })).toMatchObject({ mode: 'local', realm: 'invoices' });
  });
});
