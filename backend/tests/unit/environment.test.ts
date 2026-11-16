import { describe, expect, it } from 'vitest';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { ConfigurationError } from '@/shared/application/configuration-error';
import { keycloakConfiguration } from '@/modules/identity/infrastructure/keycloak/configuration';

const base = { MONGODB_URI: 'mongodb://127.0.0.1:27017/invoices_test' };
describe('runtime environment and identity configuration', () => {
  it('accepts MongoDB configuration without Keycloak', () => {
    const env = readServerEnvironment(base);
    expect(env.NODE_ENV).toBe('development');
    expect(keycloakConfiguration(env)).toBeNull();
  });
  it.each([{}, { MONGODB_URI: '' }, { MONGODB_URI: 'https://invalid' }])('rejects invalid MongoDB configuration: %j', env => {
    expect(() => readServerEnvironment(env)).toThrow(ConfigurationError);
  });
  it.each([{ KEYCLOAK_AUDIENCE: 'api' }, { KEYCLOAK_ISSUER_URL: 'https://identity.invalid/realm' }])('rejects partial identity configuration: %j', fields => {
    expect(() => readServerEnvironment({ ...base, ...fields })).toThrow(ConfigurationError);
  });
  it('accepts complete metadata without creating a verifier', () => {
    const env = readServerEnvironment({ ...base, KEYCLOAK_ISSUER_URL: 'https://identity.invalid/realm', KEYCLOAK_AUDIENCE: 'api' });
    expect(keycloakConfiguration(env)).toEqual({ issuer: 'https://identity.invalid/realm', audience: 'api', jwksUrl: 'https://identity.invalid/realm/protocol/openid-connect/certs' });
  });
  it('does not expose secret values in diagnostics', () => {
    try { readServerEnvironment({ MONGODB_URI: 'SECRET_VALUE' }); }
    catch (error) { expect(String(error)).not.toContain('SECRET_VALUE'); expect((error as ConfigurationError).fields).toContain('MONGODB_URI'); }
  });
  it('keeps public issuer while using an internal JWKS destination', () => {
    const env = readServerEnvironment({ ...base, KEYCLOAK_ISSUER_URL: 'http://localhost:8080/realms/invoices', KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_JWKS_URL: 'http://keycloak:8080/realms/invoices/protocol/openid-connect/certs' });
    expect(keycloakConfiguration(env)).toMatchObject({ issuer: 'http://localhost:8080/realms/invoices', jwksUrl: 'http://keycloak:8080/realms/invoices/protocol/openid-connect/certs' });
  });
  it('allows an internal directory issuer only for the same realm', () => {
    const env = readServerEnvironment({ ...base, KEYCLOAK_ISSUER_URL: 'http://localhost:8181/realms/invoices', KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_DIRECTORY_ISSUER_URL: 'http://keycloak:8080/realms/invoices' });
    expect(env.KEYCLOAK_DIRECTORY_ISSUER_URL).toBe('http://keycloak:8080/realms/invoices');
    expect(() => readServerEnvironment({ ...base, KEYCLOAK_ISSUER_URL: 'http://localhost:8181/realms/invoices', KEYCLOAK_AUDIENCE: 'invoices-api', KEYCLOAK_DIRECTORY_ISSUER_URL: 'http://keycloak:8080/realms/other' })).toThrow(ConfigurationError);
  });
  it.each([
    { KEYCLOAK_JWKS_URL: 'https://identity.invalid/certs' },
    { KEYCLOAK_ISSUER_URL: 'file:///private', KEYCLOAK_AUDIENCE: 'api' },
    { KEYCLOAK_ISSUER_URL: 'https://user:secret@identity.invalid', KEYCLOAK_AUDIENCE: 'api' },
    { KEYCLOAK_ISSUER_URL: 'http://identity.invalid/realm', KEYCLOAK_AUDIENCE: 'api' },
    { NODE_ENV: 'production', KEYCLOAK_ISSUER_URL: 'http://localhost:8080/realms/invoices', KEYCLOAK_AUDIENCE: 'api' },
  ])('rejects unsafe or partial identity metadata', fields => {
    expect(() => readServerEnvironment({ ...base, ...fields })).toThrow(ConfigurationError);
  });
  it('validates SMTP configuration, authentication secret references, and TLS outside development', () => {
    const enabled = { ...base, SMTP_ENABLED: true, SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_TLS_MODE: 'starttls',
      SMTP_FROM_ADDRESS: 'noreply@example.invalid', INVITATION_PUBLIC_ORIGIN: 'https://app.example.invalid', NOTIFICATION_PAYLOAD_KEY_FILE: '/run/secrets/key' };
    expect(readServerEnvironment(enabled)).toMatchObject({ SMTP_ENABLED: true, SMTP_TLS_MODE: 'starttls' });
    expect(() => readServerEnvironment({ ...base, SMTP_ENABLED: true })).toThrow(ConfigurationError);
    expect(() => readServerEnvironment({ ...enabled, NODE_ENV: 'production', SMTP_TLS_MODE: 'plain' })).toThrow(ConfigurationError);
    expect(() => readServerEnvironment({ ...base, SMTP_ENABLED: true, SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '25', SMTP_TLS_MODE: 'plain',
      SMTP_FROM_ADDRESS: 'noreply@example.invalid', INVITATION_PUBLIC_ORIGIN: 'http://localhost:5173', NOTIFICATION_PAYLOAD_KEY_FILE: '/run/secrets/key' })).toThrow(ConfigurationError);
    expect(() => readServerEnvironment({ ...enabled, SMTP_USERNAME: 'mailer' })).toThrow(ConfigurationError);
    expect(readServerEnvironment(base).INVITATION_TTL_HOURS).toBe(72);
    expect(readServerEnvironment({ ...base, INVITATION_TTL_HOURS: '24' }).INVITATION_TTL_HOURS).toBe(24);
  });
});

it('parses mounted versioned payload keys and requires the active version', () => {
  const config = readServerEnvironment({ ...base, SMTP_ENABLED: true, SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_TLS_MODE: 'starttls',
    SMTP_FROM_ADDRESS: 'noreply@example.invalid', INVITATION_PUBLIC_ORIGIN: 'https://app.example.invalid',
    NOTIFICATION_PAYLOAD_KEY_FILES: '1=/run/secrets/key-v1;2=/run/secrets/key-v2', NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION: '2' });
  expect(config.NOTIFICATION_PAYLOAD_KEYRING).toEqual({ activeVersion: 2, keyFiles: { 1: '/run/secrets/key-v1', 2: '/run/secrets/key-v2' } });
  expect(() => readServerEnvironment({ ...base, SMTP_ENABLED: true, SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_TLS_MODE: 'starttls',
    SMTP_FROM_ADDRESS: 'noreply@example.invalid', INVITATION_PUBLIC_ORIGIN: 'https://app.example.invalid',
    NOTIFICATION_PAYLOAD_KEY_FILES: '1=/run/secrets/key-v1', NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION: '2' })).toThrow(ConfigurationError);
  expect(() => readServerEnvironment({ ...base, NOTIFICATION_PAYLOAD_KEY_FILES: '1=/a;1=/b' })).toThrow(ConfigurationError);
});
