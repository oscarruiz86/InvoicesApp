import { randomUUID } from 'node:crypto';
import type { ClientSession, Connection } from 'mongoose';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import { CatalogError, isCatalogName, validateCatalogCode, validateEntry, type CatalogEntry, type CatalogName } from '../../domain/catalogs';

const collectionName = 'parametric_catalog_entries';
const eventCollectionName = 'parametric_catalog_events';
type Row = Record<string, unknown>;

function decode(row: Row): CatalogEntry {
  if (typeof row.catalog !== 'string' || !isCatalogName(row.catalog) || typeof row.code !== 'string' || !validateCatalogCode(row.catalog, row.code)
    || typeof row.label !== 'string' || typeof row.active !== 'boolean' || !Number.isSafeInteger(row.version) || Number(row.version) < 1
    || typeof row.source !== 'string' || typeof row.updatedBy !== 'string' || !(row.updatedAt instanceof Date)
    || (row.parentCode !== null && typeof row.parentCode !== 'string')) throw new CatalogError('STORAGE_UNAVAILABLE');
  const territoryType = row.territoryType;
  if (territoryType !== null && !['Municipio', 'Isla', 'Área no municipalizada'].includes(String(territoryType))) throw new CatalogError('STORAGE_UNAVAILABLE');
  return { catalog: row.catalog, code: row.code, label: row.label, parentCode: row.parentCode as string | null,
    territoryType: territoryType as CatalogEntry['territoryType'], active: row.active, version: Number(row.version), source: row.source,
    updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedBy };
}

export interface CatalogSeedEntry {
  readonly catalog: CatalogName; readonly code: string; readonly label: string; readonly parentCode: string | null;
  readonly territoryType: CatalogEntry['territoryType']; readonly active: boolean; readonly source: string;
}

function match(entry: Pick<CatalogSeedEntry, 'catalog' | 'code' | 'parentCode'>) {
  return { catalog: entry.catalog, code: entry.code, parentCode: entry.parentCode };
}

export function createCatalogRepository(connect: () => Promise<Connection>, policyFactory: (connection: Connection, session: ClientSession) => PolicyConfirmation) {
  let initialized: Promise<void> | undefined;
  async function ready(connection: Connection) {
    if (!initialized) initialized = Promise.all([
      connection.collection(collectionName).createIndex({ catalog: 1, code: 1, parentCode: 1 }, { unique: true, name: 'parametric_catalog_code_parent_unique' }),
      connection.collection(collectionName).createIndex({ catalog: 1, parentCode: 1, active: 1, label: 1 }, { name: 'parametric_catalog_parent_options' }),
      connection.collection(eventCollectionName).createIndex({ eventId: 1 }, { unique: true, name: 'parametric_catalog_events_id_unique' }),
      connection.collection(eventCollectionName).createIndex({ catalog: 1, code: 1, at: -1 }, { name: 'parametric_catalog_events_timeline' }),
    ]).then(() => undefined).catch(error => { initialized = undefined; throw error; });
    await initialized;
  }
  async function findLabel(catalog: CatalogName, code: string, parentCode: string | null) {
    try {
      const connection = await connect(); await ready(connection);
      const row = await connection.collection(collectionName).findOne({ catalog, code, parentCode });
      return row ? decode(row as Row).label : null;
    } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
  }

  return {
    async list(catalog: CatalogName, parentCode?: string) {
      try {
        const connection = await connect(); await ready(connection);
        const rows = await connection.collection(collectionName).find({ catalog, active: true, ...(parentCode ? { parentCode } : {}) }).sort({ label: 1, code: 1 }).toArray();
        return rows.map(row => decode(row as Row));
      } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    async validateLocation(input: { country: string | null; department: string | null; city: string | null }) {
      const { country, department, city } = input;
      if (!country && !department && !city) return true;
      if (!country && (department || city) || !department && city) return false;
      try {
        const connection = await connect(); await ready(connection); const entries = connection.collection(collectionName);
        if (country && !await entries.findOne({ catalog: 'countries', code: country, parentCode: null, active: true })) return false;
        if (department && !await entries.findOne({ catalog: 'departments', code: department, parentCode: country, active: true })) return false;
        if (city && !await entries.findOne({ catalog: 'municipalities', code: city, parentCode: department, active: true })) return false;
        return true;
      } catch { throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    label: findLabel,
    async resolveLocation(input: { country: string | null; department: string | null; city: string | null }) {
      const [countryLabel, departmentLabel, cityLabel] = await Promise.all([
        input.country ? findLabel('countries', input.country, null) : null,
        input.department ? findLabel('departments', input.department, input.country) : null,
        input.city ? findLabel('municipalities', input.city, input.department) : null,
      ]);
      return { countryLabel, departmentLabel, cityLabel };
    },
    async updateLabel(input: { catalog: CatalogName; code: string; parentCode: string | null; label: string; expectedVersion: number; actor: string; policyVersion: string }) {
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !input.label.trim() || input.label.trim().length > 128
        || !/^[1-9]\d*$/.test(input.policyVersion)) throw new CatalogError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ready(connection);
        return await connection.transaction(async session => {
          try { await policyFactory(connection, session).confirm(input.policyVersion); }
          catch { throw new CatalogError('FORBIDDEN'); }
          const filter = { ...match({ catalog: input.catalog, code: input.code, parentCode: input.parentCode }), version: input.expectedVersion };
          const current = await connection.collection(collectionName).findOne(filter, { session });
          if (!current) {
            const exists = await connection.collection(collectionName).findOne(match({ catalog: input.catalog, code: input.code, parentCode: input.parentCode }), { session });
            if (!exists) throw new CatalogError('RESOURCE_NOT_FOUND');
            throw new CatalogError('CATALOG_VERSION_CONFLICT');
          }
          const previous = decode(current as Row);
          if (previous.label === input.label.trim()) return previous;
          const at = new Date(); const version = previous.version + 1;
          const updated = await connection.collection(collectionName).updateOne(filter, { $set: { label: input.label.trim(), updatedAt: at, updatedBy: input.actor, version } }, { session });
          if (updated.modifiedCount !== 1) throw new CatalogError('CATALOG_VERSION_CONFLICT');
          await connection.collection(eventCollectionName).insertOne({ eventId: randomUUID(), catalog: input.catalog, code: input.code, parentCode: input.parentCode,
            actor: input.actor, at, previousLabel: previous.label, label: input.label.trim(), previousVersion: previous.version, version }, { session });
          return { ...previous, label: input.label.trim(), updatedAt: at.toISOString(), updatedBy: input.actor, version };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    async createEntry(input: { catalog: CatalogName; code: string; label: string; parentCode: string | null; actor: string; policyVersion: string }) {
      if (!['countries', 'departments', 'municipalities', 'document-types'].includes(input.catalog) || !validateEntry(input) || !/^[1-9]\d*$/.test(input.policyVersion)) throw new CatalogError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ready(connection);
        return await connection.transaction(async session => {
          try { await policyFactory(connection, session).confirm(input.policyVersion); } catch { throw new CatalogError('FORBIDDEN'); }
          const entries = connection.collection(collectionName); const key = { catalog: input.catalog, code: input.code, parentCode: input.parentCode };
          if (input.catalog === 'departments' && !await entries.findOne({ catalog: 'countries', code: input.parentCode, parentCode: null, active: true }, { session })) throw new CatalogError('INVALID_REQUEST');
          if (input.catalog === 'municipalities' && !await entries.findOne({ catalog: 'departments', code: input.parentCode, parentCode: 'CO', active: true }, { session })) throw new CatalogError('INVALID_REQUEST');
          const existing = await entries.findOne(key, { session });
          if (existing) { if ((existing as Row).active) throw new CatalogError('INVALID_REQUEST');
            const version = Number((existing as Row).version) + 1; const at = new Date();
            await entries.updateOne({ ...key, version: (existing as Row).version }, { $set: { active: true, label: input.label.trim(), version, updatedAt: at, updatedBy: input.actor } }, { session });
            await connection.collection(eventCollectionName).insertOne({ eventId: randomUUID(), ...key, actor: input.actor, at, previousLabel: (existing as Row).label, label: input.label.trim(), previousVersion: (existing as Row).version, version, action: 'reactivated' }, { session });
            return decode({ ...(existing as Row), active: true, label: input.label.trim(), version, updatedAt: at, updatedBy: input.actor });
          }
          const at = new Date(); const row = { ...key, label: input.label.trim(), territoryType: null, active: true, version: 1, source: 'managed', updatedAt: at, updatedBy: input.actor };
          await entries.insertOne(row, { session });
          await connection.collection(eventCollectionName).insertOne({ eventId: randomUUID(), ...key, actor: input.actor, at, previousLabel: null, label: input.label.trim(), previousVersion: null, version: 1, action: 'created' }, { session });
          return decode(row);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    async deactivateDocumentType(input: { code: string; expectedVersion: number; actor: string; policyVersion: string }) {
      if (!validateCatalogCode('document-types', input.code) || input.code === 'NIT' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !/^[1-9]\d*$/.test(input.policyVersion)) throw new CatalogError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ready(connection);
        return await connection.transaction(async session => {
          try { await policyFactory(connection, session).confirm(input.policyVersion); } catch { throw new CatalogError('FORBIDDEN'); }
          const entries = connection.collection(collectionName); const key = { catalog: 'document-types', code: input.code, parentCode: null, version: input.expectedVersion };
          const current = await entries.findOne(key, { session }); if (!current) throw new CatalogError('CATALOG_VERSION_CONFLICT');
          const previous = decode(current as Row); const at = new Date(); const version = previous.version + 1;
          await entries.updateOne(key, { $set: { active: false, version, updatedAt: at, updatedBy: input.actor } }, { session });
          await connection.collection(eventCollectionName).insertOne({ eventId: randomUUID(), catalog: 'document-types', code: input.code, parentCode: null, actor: input.actor, at, previousLabel: previous.label, label: previous.label, previousVersion: previous.version, version, action: 'deactivated' }, { session });
          return { ...previous, active: false, version, updatedAt: at.toISOString(), updatedBy: input.actor };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    async deactivateEntry(input: { catalog: CatalogName; code: string; parentCode: string | null; expectedVersion: number; actor: string; policyVersion: string }) {
      if (!['document-types', 'countries', 'departments', 'municipalities'].includes(input.catalog) || !validateCatalogCode(input.catalog, input.code) || input.catalog === 'document-types' && input.code === 'NIT' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !/^[1-9]\d*$/.test(input.policyVersion)) throw new CatalogError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ready(connection);
        return await connection.transaction(async session => {
          try { await policyFactory(connection, session).confirm(input.policyVersion); } catch { throw new CatalogError('FORBIDDEN'); }
          const entries = connection.collection(collectionName); const key = { catalog: input.catalog, code: input.code, parentCode: input.parentCode, version: input.expectedVersion };
          const current = await entries.findOne(key, { session }); if (!current) throw new CatalogError('CATALOG_VERSION_CONFLICT');
          const child = input.catalog === 'countries' ? await entries.findOne({ catalog: 'departments', parentCode: input.code, active: true }, { session })
            : input.catalog === 'departments' ? await entries.findOne({ catalog: 'municipalities', parentCode: input.code, active: true }, { session }) : null;
          if (child) throw new CatalogError('INVALID_REQUEST');
          const field = input.catalog === 'document-types' ? 'documentType' : input.catalog === 'countries' ? 'country' : input.catalog === 'departments' ? 'department' : 'city';
          for (const name of ['companies', 'third_parties']) if (await connection.collection(name).findOne({ [field]: input.code }, { session })) throw new CatalogError('INVALID_REQUEST');
          const previous = decode(current as Row); const at = new Date(); const version = previous.version + 1;
          await entries.updateOne(key, { $set: { active: false, version, updatedAt: at, updatedBy: input.actor } }, { session });
          await connection.collection(eventCollectionName).insertOne({ eventId: randomUUID(), catalog: input.catalog, code: input.code, parentCode: input.parentCode, actor: input.actor, at, previousLabel: previous.label, label: previous.label, previousVersion: previous.version, version, action: 'deactivated' }, { session });
          return { ...previous, active: false, version, updatedAt: at.toISOString(), updatedBy: input.actor };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { if (error instanceof CatalogError) throw error; throw new CatalogError('STORAGE_UNAVAILABLE'); }
    },
    async seed(entries: readonly CatalogSeedEntry[], sourceVersion: string, sourceHash: string) {
      const connection = await connect(); await ready(connection);
      const operations = entries.map(entry => ({ updateOne: { filter: match(entry), update: { $setOnInsert: {
        ...entry, sourceVersion, sourceHash, label: entry.label, version: 1, updatedAt: new Date(), updatedBy: 'catalog-seed',
      } }, upsert: true } }));
      if (operations.length) await connection.collection(collectionName).bulkWrite(operations, { ordered: false });
      await connection.collection('parametric_catalog_sources').updateOne({ sourceVersion }, { $set: { sourceVersion, sourceHash, loadedAt: new Date(), entries: entries.length } }, { upsert: true });
      return { entries: entries.length, sourceVersion, sourceHash };
    },
  };
}
