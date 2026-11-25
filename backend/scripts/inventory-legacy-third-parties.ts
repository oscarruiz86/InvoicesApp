import { connectMongo } from '../src/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '../src/shared/infrastructure/config/server-environment';
import { inventoryLegacyThirdParties } from '../src/modules/organizations/infrastructure/mongodb/third-party-readiness';

const environment = readServerEnvironment();
const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
try {
  const result = await inventoryLegacyThirdParties(connection);
  console.info(JSON.stringify(result));
} finally {
  await connection.close();
}
