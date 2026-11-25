import { createServer } from 'vite';
import { resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, resolve: { alias: { '@': resolve('src') } } });
let close;
try {
  const { readServerEnvironment } = await server.ssrLoadModule('/src/shared/infrastructure/config/server-environment.ts');
  const { connectMongo, closeMongo } = await server.ssrLoadModule('/src/shared/infrastructure/mongodb/connection.ts');
  const { fileSecretReader } = await server.ssrLoadModule('/src/shared/infrastructure/file-secrets/file-secret-reader.ts');
  const environment = readServerEnvironment();
  if (environment.NODE_ENV !== 'development') throw new Error('DEV_RESET_ENVIRONMENT_REQUIRED');
  const uri = environment.MONGODB_URI ?? (environment.MONGODB_URI_FILE ? await fileSecretReader.read(environment.MONGODB_URI_FILE) : '');
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' || !['localhost', '127.0.0.1', '[::1]', 'mongodb'].includes(parsed.hostname)) throw new Error('DEV_RESET_LOCAL_DATABASE_REQUIRED');
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName || !(databaseName === 'invoices_app' || databaseName.endsWith('_test'))) throw new Error('DEV_RESET_DATABASE_NOT_ALLOWLISTED');
  if (apply && process.env.PARAMETRIC_CATALOGS_RESET_DATABASE !== databaseName) throw new Error('DEV_RESET_EXPLICIT_DATABASE_CONFIRMATION_REQUIRED');
  close = closeMongo;
  const connection = await connectMongo({ uri: environment.MONGODB_URI, file: environment.MONGODB_URI_FILE });
  const collection = name => connection.collection(name);
  const [companies, thirdParties, organizations] = await Promise.all([
    collection('companies').find({}, { projection: { _id: 1 } }).toArray(),
    collection('third_parties').find({}, { projection: { _id: 1 } }).toArray(),
    collection('organizations').find({ type: { $in: ['COMPANY', 'THIRD_PARTY'] } }, { projection: { id: 1 } }).toArray(),
  ]);
  const organizationIds = [...new Set(organizations.map(value => String(value.id)))];
  const memberships = organizationIds.length ? await collection('organization_memberships').find({ organizationId: { $in: organizationIds } }, { projection: { id: 1 } }).toArray() : [];
  const membershipIds = memberships.map(value => String(value.id));
  const associations = organizationIds.length || membershipIds.length ? await collection('organization_associations').find({ $or: [
    ...(organizationIds.length ? [{ organizationId: { $in: organizationIds } }] : []), ...(membershipIds.length ? [{ membershipId: { $in: membershipIds } }] : []),
  ] }, { projection: { id: 1, membershipId: 1 } }).toArray() : [];
  const invitations = organizationIds.length ? await collection('organization_invitations').find({ organizationId: { $in: organizationIds } }, { projection: { id: 1 } }).toArray() : [];
  const invitationIds = invitations.map(value => String(value.id));
  const count = (name, total) => ({ collection: name, count: total });
  const plan = [count('companies', companies.length), count('third_parties', thirdParties.length), count('organizations', organizations.length),
    count('organization_memberships', memberships.length), count('organization_associations', associations.length), count('company_third_party_relations', organizationIds.length ? await collection('company_third_party_relations').countDocuments({ $or: [
      { companyId: { $in: organizationIds } }, { thirdPartyId: { $in: organizationIds } },
    ] }) : 0), count('organization_invitations', invitations.length),
    count('organization_invitation_events', invitationIds.length ? await collection('organization_invitation_events').countDocuments({ invitationId: { $in: invitationIds } }) : 0),
    count('organization_membership_events', organizationIds.length ? await collection('organization_membership_events').countDocuments({ organizationId: { $in: organizationIds } }) : 0),
    count('company_management_events', companies.length ? await collection('company_management_events').countDocuments({ companyId: { $in: companies.map(value => value._id) } }) : 0),
    count('third_party_management_events', thirdParties.length ? await collection('third_party_management_events').countDocuments({ thirdPartyId: { $in: thirdParties.map(value => value._id) } }) : 0)];
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', environment: environment.NODE_ENV, database: databaseName, affected: plan }, null, 2));
  if (!apply) { console.log('Sin cambios. Usa --apply y PARAMETRIC_CATALOGS_RESET_DATABASE con el nombre exacto para borrar estos datos sintéticos.'); }
  else {
    await connection.transaction(async session => {
      const ids = { companies: companies.map(value => value._id), thirdParties: thirdParties.map(value => value._id) };
      if (ids.companies.length) await collection('companies').deleteMany({ _id: { $in: ids.companies } }, { session });
      if (ids.thirdParties.length) await collection('third_parties').deleteMany({ _id: { $in: ids.thirdParties } }, { session });
      if (organizationIds.length) {
        await collection('organizations').deleteMany({ id: { $in: organizationIds }, type: { $in: ['COMPANY', 'THIRD_PARTY'] } }, { session });
        await collection('organization_memberships').deleteMany({ organizationId: { $in: organizationIds } }, { session });
        await collection('organization_associations').deleteMany({ $or: [
          { organizationId: { $in: organizationIds } }, ...(membershipIds.length ? [{ membershipId: { $in: membershipIds } }] : []),
        ] }, { session });
        await collection('company_third_party_relations').deleteMany({ $or: [{ companyId: { $in: organizationIds } }, { thirdPartyId: { $in: organizationIds } }] }, { session });
        await collection('organization_membership_events').deleteMany({ organizationId: { $in: organizationIds } }, { session });
        await collection('organization_invitations').deleteMany({ organizationId: { $in: organizationIds } }, { session });
      }
      if (invitationIds.length) await collection('organization_invitation_events').deleteMany({ invitationId: { $in: invitationIds } }, { session });
      if (ids.companies.length) await collection('company_management_events').deleteMany({ companyId: { $in: ids.companies } }, { session });
      if (ids.thirdParties.length) await collection('third_party_management_events').deleteMany({ thirdPartyId: { $in: ids.thirdParties } }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 10000 });
    console.log('Limpieza de datos sintéticos completada.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development data reset failed.');
  process.exitCode = 1;
} finally {
  await close?.();
  await server.close();
}
