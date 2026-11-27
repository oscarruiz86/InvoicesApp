import { randomUUID } from 'node:crypto';
import { createAuditHistoryQueries } from '@/modules/audit/application/audit-history';
import { createMongoAuditHistoryReader } from '@/modules/audit/infrastructure/mongodb/audit-history-reader';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { auditHistoryHandlers } from '@/modules/audit/presentation/audit-history';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';
import { Types } from 'mongoose';

const identityConfiguration = async () => {
  const env = readServerEnvironment();
  const clientSecret = env.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE
    ? await fileSecretReader.read(env.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE)
    : env.NODE_ENV !== 'production' ? env.KEYCLOAK_DIRECTORY_CLIENT_SECRET ?? '' : '';
  return { issuer: String(env.KEYCLOAK_ISSUER_URL ?? ''), directoryIssuer: String(env.KEYCLOAK_DIRECTORY_ISSUER_URL ?? env.KEYCLOAK_ISSUER_URL ?? ''),
    clientId: env.KEYCLOAK_DIRECTORY_CLIENT_ID ?? '', clientSecret };
};
const identity = createIdentityProfileReader(identityConfiguration);
const nameCache = new Map<string, { readonly expiresAt: number; readonly value: string | null }>();
const nameRequests = new Map<string, Promise<string | null>>();
let identityUnavailableUntil = 0;
const actorDisplayName = (subject: string): Promise<string | null> => {
  if (identityUnavailableUntil > Date.now()) return Promise.resolve(null);
  const cached = nameCache.get(subject);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  const pending = nameRequests.get(subject); if (pending) return pending;
  const request = identity.read(subject).then(profile => profile?.fullName ?? null).catch(() => { identityUnavailableUntil = Date.now() + 30_000; return null; }).then(value => {
    if (nameCache.size >= 1000) nameCache.delete(nameCache.keys().next().value!);
    nameCache.set(subject, { expiresAt: Date.now() + 5 * 60_000, value });
    return value;
  }).finally(() => nameRequests.delete(subject));
  nameRequests.set(subject, request); return request;
};

const connect = async () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const queries = createAuditHistoryQueries({ reader: { async list(input) { return createMongoAuditHistoryReader(await connect()).list(input); }, async find(id) { return createMongoAuditHistoryReader(await connect()).find(id); } },
  writer: { async record(event) { await createMongoAuditWriter(await connect()).record(event); } }, now: () => new Date(), nextId: randomUUID });
const entityNameCache = new Map<string, { readonly expiresAt: number; readonly value: string | null }>();
const entityDisplayName = async (type: 'company' | 'third-party', id: string | null): Promise<string | null> => {
  if (!id || !/^[a-f\d]{24}$/iu.test(id)) return null;
  const key = `${type}:${id}`; const cached = entityNameCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const connection = await connect();
  const collection = connection.collection(type === 'company' ? 'companies' : 'third_parties');
  const row = await collection.findOne({ _id: new Types.ObjectId(id) }, { projection: { businessName: 1, tradeName: 1 } });
  const name = typeof row?.tradeName === 'string' && row.tradeName ? row.tradeName : typeof row?.businessName === 'string' ? row.businessName : null;
  if (entityNameCache.size >= 2000) entityNameCache.delete(entityNameCache.keys().next().value!);
  entityNameCache.set(key, { expiresAt: Date.now() + 5 * 60_000, value: name });
  return name;
};
const entityDisplayNames = async (event: import('@/modules/audit/application/audit-history').SafeAuditEvent) => {
  const companyId = event.scope?.companyId ?? (event.resource?.type === 'company' ? event.resource.id : null);
  const thirdPartyId = event.scope?.thirdPartyId ?? (event.resource?.type === 'third-party' ? event.resource.id : null);
  const [company, thirdParty, resource] = await Promise.all([
    entityDisplayName('company', companyId), entityDisplayName('third-party', thirdPartyId),
    event.resource?.type === 'company' ? entityDisplayName('company', event.resource.id) : event.resource?.type === 'third-party' ? entityDisplayName('third-party', event.resource.id) : Promise.resolve(null),
  ]);
  const displayNames = { ...(company ? { company } : {}), ...(thirdParty ? { thirdParty } : {}), ...(resource ? { resource } : {}) };
  return Object.keys(displayNames).length ? { ...event, displayNames } : event;
};
const searchActors = async (text: string) => (await identity.search?.({ text }) ?? []).map(profile => profile.subject).slice(0, 100);
const handlers = auditHistoryHandlers(queries, authorization, actorDisplayName, entityDisplayNames, searchActors);
export const auditHistoryListEndpoint = authenticatedEndpoint(handlers.list);
export const auditHistoryDetailEndpoint = authenticatedEndpoint((actor, request) => {
  const segment = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  let eventId = ''; try { eventId = decodeURIComponent(segment); } catch { /* invalid path is a neutral 400 */ }
  return handlers.detail(actor, request, eventId);
});
