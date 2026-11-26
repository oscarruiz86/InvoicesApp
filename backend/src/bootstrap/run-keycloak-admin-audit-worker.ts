import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { connectMongo, closeMongo } from '@/shared/infrastructure/mongodb/connection';
import { createMongoKeycloakAdminCursor } from '@/modules/identity/infrastructure/mongodb/keycloak-admin-cursor';
import { createKeycloakAdminEventApi } from '@/modules/identity/infrastructure/keycloak/admin-event-api';
import { createKeycloakAdminEventCollector, type KeycloakAdminAuditWriter } from '@/modules/identity/infrastructure/keycloak/admin-event-collector';
import { resolveKeycloakAdminAuditRuntimeConfiguration } from '@/modules/identity/infrastructure/keycloak/admin-audit-runtime-configuration';

async function main(): Promise<void> {
  const environment = resolveKeycloakAdminAuditRuntimeConfiguration(process.env);
  if (environment.mode === 'disabled') {
    process.stdout.write(JSON.stringify({ event: 'keycloak_admin_audit_worker_disabled', reason: 'production_configuration_absent' }) + '\n');
    return;
  }
  const secret = (await readFile(environment.secretFile, 'utf8')).trim();
  if (!secret || secret.length > 4096) throw new Error('KEYCLOAK_ADMIN_AUDIT_CONFIG_INVALID');
  const moduleUrl = pathToFileURL(environment.writerModule).href;
  const auditAdapter = await import(moduleUrl) as { createMongoAuditWriter?: (connection: import('mongoose').Connection) => KeycloakAdminAuditWriter };
  if (typeof auditAdapter.createMongoAuditWriter !== 'function') throw new Error('KEYCLOAK_ADMIN_AUDIT_WRITER_UNAVAILABLE');
  const connection = await connectMongo(environment.mode === 'production' ? { file: environment.mongoUriFile } : { uri: environment.mongoUri });
  const cursor = createMongoKeycloakAdminCursor(connection, environment.realm);
  const collector = createKeycloakAdminEventCollector({ realm: environment.realm,
    source: createKeycloakAdminEventApi({ baseUrl: environment.baseUrl, realm: environment.realm, clientId: environment.clientId, clientSecret: secret }),
    cursor, audit: auditAdapter.createMongoAuditWriter(connection),
  });
  const lagMs = async (): Promise<number | null> => {
    try { const lastAccepted = await cursor.load(); return lastAccepted === null ? null : Math.max(0, Date.now() - lastAccepted); }
    catch { return null; }
  };
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let failures = 0;
  while (!stopping) {
    try {
      const delivered = await collector.pollOnce();
      failures = 0;
      process.stdout.write(JSON.stringify({ event: 'keycloak_admin_audit_poll', delivered, lagMs: await lagMs() }) + '\n');
    } catch {
      failures = Math.min(failures + 1, 6);
      process.stderr.write(JSON.stringify({ event: 'keycloak_admin_audit_poll_failed', category: 'source_or_audit_unavailable', retry: failures, lagMs: await lagMs() }) + '\n');
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, failures ? Math.min(60_000, 1_000 * (2 ** failures)) : 10_000));
  }
  await closeMongo();
}

main().catch(() => { process.stderr.write('{"event":"keycloak_admin_audit_worker_failed"}\n'); process.exitCode = 1; });
