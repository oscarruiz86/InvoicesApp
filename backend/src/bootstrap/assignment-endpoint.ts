import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { createAssignments, AssignmentUseCaseError } from '@/modules/fleet/application/assignments';
import { createAssignmentAuthorizationPort } from '@/modules/fleet/application/assignment-authorization';
import { assignmentResponse, type AssignmentOperation } from '@/modules/fleet/presentation/assignments';
import { createDriverRepository } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { createVehicleRepository } from '@/modules/fleet/infrastructure/mongodb/vehicle-repository';
import { createMongoAssignmentAudit, createMongoAssignmentConfirmation, createMongoAssignmentRepository } from '@/modules/fleet/infrastructure/mongodb/assignment-repository';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { vehicleAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/vehicle-authority';
import { authorization, policyRepository } from './authorization-endpoint';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';

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
const drivers = createDriverRepository(connect, policyConfirmation, createMongoAssignmentConfirmation, createMongoAuditWriter);
const vehicles = createVehicleRepository(connect, (connection, session) => ({ policy: policyConfirmation(connection, session),
  authority: vehicleAuthorityConfirmation(connection, session), assignments: createMongoAssignmentConfirmation(connection, session), audit: createMongoAuditWriter(connection, session) }));
const repository = createMongoAssignmentRepository(connect, (connection, session) => ({ policy: policyConfirmation(connection, session),
  authority: vehicleAuthorityConfirmation(connection, session), audit: createMongoAssignmentAudit(connection, session, createMongoAuditWriter(connection, session)) }));
const assignmentAuthorization = createAssignmentAuthorizationPort({ authorization, policies: policyRepository });

export const assignments = createAssignments({
  repository,
  authorization: assignmentAuthorization,
  drivers: {
    async read(input) {
      const driver = await drivers.find(input);
      if (!driver) return null;
      const [eligibility, profile] = await Promise.all([
        drivers.eligibility({ subject: driver.subject, thirdPartyId: input.thirdPartyId }),
        identity.read(driver.subject),
      ]);
      if (!profile?.enabled || !profile.fullName) throw new AssignmentUseCaseError('ASSIGNMENT_STORAGE_UNAVAILABLE');
      return { id: driver.id, thirdPartyId: driver.thirdPartyId, subject: driver.subject, displayName: profile.fullName,
        version: driver.version, eligible: eligibility.eligible };
    },
  },
  vehicles: {
    async read(input) {
      const facts = await vehicles.eligibility(input);
      if (!facts.vehicleId || facts.version === null) return null;
      return { id: facts.vehicleId, thirdPartyId: input.thirdPartyId, version: facts.version, eligible: facts.eligible, plate: facts.plate };
    },
  },
  ids: { next: () => new Types.ObjectId().toString() },
  clock: { now: () => new Date() },
  correlationId: randomUUID,
});

export function assignmentsEndpoint(operation: AssignmentOperation, id?: string) {
  return authenticatedEndpoint((actor, request) => assignmentResponse(assignments, operation, actor, request, id));
}
