import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { connectMongo, closeMongo } from '@/shared/infrastructure/mongodb/connection';
import { createMongoKeycloakAdminCursor } from '@/modules/identity/infrastructure/mongodb/keycloak-admin-cursor';
import { createKeycloakAdminEventApi } from '@/modules/identity/infrastructure/keycloak/admin-event-api';
import { createKeycloakAdminEventCollector, type KeycloakAdminAuditWriter } from '@/modules/identity/infrastructure/keycloak/admin-event-collector';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_MISSING');
  return value;
};

async function main(): Promise<void> {
  const environment = {
    uri: required('MONGODB_URI'), realm: required('KEYCLOAK_ADMIN_AUDIT_REALM'),
    baseUrl: required('KEYCLOAK_ADMIN_AUDIT_BASE_URL'), clientId: required('KEYCLOAK_ADMIN_AUDIT_CLIENT_ID'),
    secretFile: required('KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE'), auditModule: required('KEYCLOAK_ADMIN_AUDIT_WRITER_MODULE'),
  };
  const secret = (await readFile(environment.secretFile, 'utf8')).trim();
  if (!secret || secret.length > 4096) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
  const moduleUrl = pathToFileURL(environment.auditModule).href;
  const auditAdapter = await import(moduleUrl) as { createMongoAuditWriter?: (connection: import('mongoose').Connection) => KeycloakAdminAuditWriter };
  if (typeof auditAdapter.createMongoAuditWriter !== 'function') throw new Error('KEYCLOAK_ADMIN_AUDIT_WRITER_UNAVAILABLE');
  const connection = await connectMongo({ uri: environment.uri });
  const collector = createKeycloakAdminEventCollector({ realm: environment.realm,
    source: createKeycloakAdminEventApi({ baseUrl: environment.baseUrl, realm: environment.realm, clientId: environment.clientId, clientSecret: secret }),
    cursor: createMongoKeycloakAdminCursor(connection, environment.realm), audit: auditAdapter.createMongoAuditWriter(connection),
  });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let failures = 0;
  while (!stopping) {
    try {
      const delivered = await collector.pollOnce();
      failures = 0;
      process.stdout.write(JSON.stringify({ event: 'keycloak_admin_audit_poll', delivered }) + '\n');
    } catch {
      failures = Math.min(failures + 1, 6);
      process.stderr.write(JSON.stringify({ event: 'keycloak_admin_audit_poll_failed', retry: failures }) + '\n');
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, failures ? Math.min(60_000, 1_000 * (2 ** failures)) : 10_000));
  }
  await closeMongo();
}

main().catch(() => { process.stderr.write('{"event":"keycloak_admin_audit_worker_failed"}\n'); process.exitCode = 1; });
