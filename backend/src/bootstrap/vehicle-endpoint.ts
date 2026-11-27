import { randomUUID } from 'node:crypto';
import { createVehicles } from '@/modules/fleet/application/vehicles';
import { createVehicleRepository } from '@/modules/fleet/infrastructure/mongodb/vehicle-repository';
import { createDriverRepository } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { createMongoAssignmentAccessReader, createMongoAssignmentConfirmation } from '@/modules/fleet/infrastructure/mongodb/assignment-repository';
import { vehicleAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/vehicle-authority';
import { policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { vehicleResponse, type VehicleOperation } from '@/modules/fleet/presentation/vehicles';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authorization, policyRepository } from './authorization-endpoint';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { authenticatedEndpoint } from './authenticated-endpoint';
const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const assignments = createMongoAssignmentAccessReader(connect);
const repository = createVehicleRepository(connect, (connection, session) => ({ policy: policyConfirmation(connection, session), authority: vehicleAuthorityConfirmation(connection, session), assignments: createMongoAssignmentConfirmation(connection, session), audit: createMongoAuditWriter(connection, session) }));
const service = createVehicles({ repository, drivers: createDriverRepository(connect, policyConfirmation, createMongoAssignmentConfirmation, createMongoAuditWriter), assignments, authorization, policies: policyRepository, correlationId: randomUUID });
export function vehiclesEndpoint(operation: VehicleOperation, id?: string) {
  return authenticatedEndpoint((actor, request) => vehicleResponse(service, operation, actor, request, id));
}
