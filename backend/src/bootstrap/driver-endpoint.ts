import { createDrivers } from '@/modules/fleet/application/drivers';
import { createDriverRepository } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { driverResponse, type DriverOperation } from '@/modules/fleet/presentation/drivers';

const connect = () => { const environment = readServerEnvironment(); return connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE }); };
const identityConfiguration = async () => {
  const environment = readServerEnvironment();
  const clientSecret = environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE
    ? await fileSecretReader.read(environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE)
    : environment.NODE_ENV !== 'production' ? environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET ?? '' : '';
  return { issuer: String(environment.KEYCLOAK_ISSUER_URL ?? ''), directoryIssuer: String(environment.KEYCLOAK_DIRECTORY_ISSUER_URL ?? environment.KEYCLOAK_ISSUER_URL ?? ''),
    clientId: environment.KEYCLOAK_DIRECTORY_CLIENT_ID ?? '', clientSecret };
};
const identity = createIdentityProfileReader(identityConfiguration);
const repository = createDriverRepository(connect, policyConfirmation);
const service = createDrivers({ repository, facts: repository, authorization, identity });

export function driversEndpoint(operation: DriverOperation, id?: string) {
  return authenticatedEndpoint((actor, request) => driverResponse(service, operation, actor, request, id));
}
