import { z } from 'zod';
import { createInvoiceAuthorizationPort } from '@/modules/invoices/application/invoice-authorization';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { createOfflineCredentialIssuer, OfflineCredentialError } from '@/modules/invoice-sync/application/offline-credential';
import { createOfflineCredentialSigner } from '@/modules/invoice-sync/infrastructure/offline-credential-signer';
import { authorization, policyRepository } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';

const id = z.string().regex(/^[a-f0-9]{24}$/);
const bodySchema = z.object({ assignments: z.array(z.object({ assignmentId: id, vehicleId: id }).strict()).min(1).max(100) }).strict();
const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const assignmentAuthority = createMongoInvoiceAssignmentAuthority(connect);
const invoiceAuthorization = createInvoiceAuthorizationPort({ authorization, policies: policyRepository });

function fail(error: unknown) {
  const code = error instanceof OfflineCredentialError ? error.code : 'CONFIGURATION_ERROR';
  const status = code === 'INVALID_REQUEST' ? 400 : code === 'FORBIDDEN' ? 403 : code === 'ASSIGNMENT_NOT_ELIGIBLE' ? 409 : 503;
  const message = status === 400 ? 'Revisa las asignaciones solicitadas.' : status === 403 ? 'No tienes permiso para captura offline.'
    : status === 409 ? 'Una de las asignaciones ya no está disponible.' : 'El servicio de credencial offline no está configurado.';
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const offlineCredentialEndpoint = authenticatedEndpoint(async (actor, request) => {
  if (request.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('scope') !== 'organization' || url.searchParams.getAll('scope').length !== 1
      || url.searchParams.getAll('thirdPartyId').length !== 1) throw new OfflineCredentialError('INVALID_REQUEST');
    const thirdPartyId = id.parse(url.searchParams.get('thirdPartyId'));
    const input = bodySchema.parse(await request.json());
    const env = readServerEnvironment();
    if (!env.OFFLINE_CREDENTIAL_SIGNING_KEY_FILE || !env.OFFLINE_CREDENTIAL_KEY_ID) throw new OfflineCredentialError('CONFIGURATION_ERROR');
    const issuer = createOfflineCredentialIssuer({ authorization: invoiceAuthorization, assignments: assignmentAuthority,
      signer: createOfflineCredentialSigner({ keyFile: env.OFFLINE_CREDENTIAL_SIGNING_KEY_FILE, keyId: env.OFFLINE_CREDENTIAL_KEY_ID, secrets: fileSecretReader }),
      clock: { now: () => new Date() } });
    const result = await issuer.issue(actor, { thirdPartyId, assignments: input.assignments, ttlHours: env.OFFLINE_CREDENTIAL_TTL_HOURS });
    return Response.json(result, { status: 201, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return fail(new OfflineCredentialError('INVALID_REQUEST'));
    return fail(error);
  }
});
