import type { Connection } from 'mongoose';

export class CompanyStorageUnavailable extends Error {
  constructor() { super('COMPANY_STORAGE_UNAVAILABLE'); }
}
/** Read-only prerequisite: never converts legacy organizations or seeds profile data. */
export async function companyReadiness(connection: Connection) {
  if (!connection.db) throw new CompanyStorageUnavailable();
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName || !hello.isWritablePrimary) throw new CompanyStorageUnavailable();
  const incompatible = await connection.collection('organizations').aggregate<{ id: string }>([
    { $match: { type: 'COMPANY' } },
    { $lookup: { from: 'companies', let: { organizationId: '$id' }, pipeline: [
      { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$organizationId'] } } },
      { $project: { _id: 1 } },
    ], as: 'profiles' } },
    { $match: { 'profiles.0': { $exists: false } } },
    { $project: { _id: 0, id: 1 } },
  ]).toArray();
  return { ready: incompatible.length === 0, incompatibleIds: incompatible.map(value => value.id) };
}
export async function requireCompanyStorage(connection: Connection) {
  try { if (!(await companyReadiness(connection)).ready) throw new CompanyStorageUnavailable(); }
  catch { throw new CompanyStorageUnavailable(); }
}
