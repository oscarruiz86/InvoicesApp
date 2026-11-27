import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createCompanyRepository, companyModel } from '@/modules/organizations/infrastructure/mongodb/company-repository';
import { createCompanies } from '@/modules/organizations/application/companies';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createOrganizationRepository } from '@/modules/organizations/infrastructure/mongodb/organization-repository';
import { grantCeiling } from '@/modules/identity/domain/permissions';
import type { CompanyAccess, CompanyRepository } from '@/modules/organizations/application/company-ports';
import { companyResponse } from '@/modules/organizations/presentation/companies';
import { createMongoAuditWriter } from '@/modules/audit/infrastructure/mongodb/audit-writer';
import { createManagementAuditOutboxWorker } from '@/modules/organizations/application/management-audit-outbox-worker';
import { createMongoManagementAuditOutbox } from '@/modules/organizations/infrastructure/mongodb/management-audit-outbox';
const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `company_management_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const repository = createCompanyRepository(async () => connection, policyConfirmation);
const events: unknown[] = [];
const serviceFor = (repo = repository) => createCompanies({ repository: repo, audit: { record: async event => { events.push(event); } }, now: () => new Date(), nextEventId: randomUUID });
const service = serviceFor();
const global: CompanyAccess = { actor: { subject: 'app-admin', roles: ['APP_ADMIN'], permissions: [], username: null, name: null, email: null }, scope: { kind: 'global', companyId: null, thirdPartyId: null } };
const profile = (documentNumber: string) => ({ documentNumber, verificationDigit: '1', businessName: 'Empresa ' + documentNumber, email: ' CONTACT@Example.COM ' });
beforeAll(async () => { await connection.asPromise(); await createPolicyRepository(async () => connection).initialize(); });
afterAll(async () => { if (connection.readyState === 1 && connection.name === database && /^company_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });

it('creates, isolates, edits, changes state and preserves history without direct association writes', async () => {
  const first = await service.create(global, profile('001'));
  await service.create(global, profile('002'));
  expect(first.company.email).toBe('contact@example.com');
  expect(first.company.createdBy).toBe('app-admin');
  expect(first.company.updatedBy).toBeNull();
  expect(await connection.collection('organization_associations').countDocuments()).toBe(0);
  const query = { page: 1, pageSize: 10, sort: 'businessName', direction: 'asc' } as const;
  expect((await service.list(global, { ...query, page: 99 })).items).toEqual([]);
  expect((await service.list(global, { ...query, q: 'Empresa 00', pageSize: 1 })).total).toBe(2);
  const explain = await companyModel(connection).find({ documentNumber: '001' }).hint({ documentNumber: 1, _id: 1 }).explain('queryPlanner') as unknown as { queryPlanner: { winningPlan: unknown } };
  expect(JSON.stringify(explain.queryPlanner.winningPlan)).toContain('documentNumber_1__id_1');
  await expect(service.administrators(global, first.company.id, 1, 20)).resolves.toMatchObject({ items: [], total: 0 });
  const edited = await service.update(global, first.company.id, first.version, { businessName: 'Nombre actualizado', city: 'Bogotá' });
  expect(edited.company.updatedBy).toBe(global.actor.subject);
  expect(edited.company.createdAt).toBe(first.company.createdAt);
  await expect(service.update(global, first.company.id, first.version, { city: 'Cali' })).rejects.toThrow('COMPANY_VERSION_CONFLICT');
  const noop = await service.update(global, first.company.id, edited.version, { city: 'Bogotá' });
  expect(noop.version).toBe(edited.version);
  const inactive = await service.setStatus(global, first.company.id, edited.version, 'INACTIVE');
  const reader = createOrganizationRepository(async () => connection);
  expect(await reader.candidates('company-admin-one')).toEqual([]);
  await expect(service.create(global, profile('001'))).rejects.toThrow('COMPANY_DOCUMENT_CONFLICT');
  await service.setStatus(global, first.company.id, inactive.version, 'ACTIVE');
  expect(await reader.candidates('company-admin-one')).toEqual([]);
  expect((await service.administrators(global, first.company.id, 1, 20)).items).toEqual([]);
  expect(await connection.collection('organization_associations').countDocuments({ organizationId: first.company.id })).toBe(0);
  const history = await connection.collection('company_management_events').find({ companyId: first.company.id }).toArray();
  expect(new Set(history.map(event => event.eventId)).size).toBe(history.length);
  expect(history.every(event => event.delivered === false && event.subject && !('token' in event))).toBe(true);
  expect(history.map(event => event.action)).toEqual(['COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_DEACTIVATED', 'COMPANY_ACTIVATED']);
  expect(history.every(event => event.correlationId && event.afterVersion)).toBe(true);
});

it('delivers transactional company captures once to the shared journal without profile fields', async () => {
  const worker = createManagementAuditOutboxWorker({ outbox: createMongoManagementAuditOutbox(async () => connection),
    audit: { async record(event) { await createMongoAuditWriter(connection).record(event); } } });
  while (await worker.deliverBatch()) { /* drain captures created by preceding test cases */ }
  const first = await service.create(global, profile('301'));
  await service.update(global, first.company.id, first.version, { businessName: 'Audit company' });
  const captures = await connection.collection('company_management_events').find({ companyId: first.company.id }).toArray();
  expect(await worker.deliverBatch()).toBe(captures.length);
  const journal = await connection.collection('audit_events').find({ _id: { $in: captures.map(event => event.eventId) } }).toArray();
  expect(journal.map(event => event._id)).toEqual(expect.arrayContaining(captures.map(event => event.eventId)));
  expect(journal.every(event => !('documentNumber' in event) && !('email' in event) && !('before' in event) && !('after' in event))).toBe(true);
  expect(await worker.deliverBatch()).toBe(0);
});

it('has unique concurrent registration and rolls back a failed audit with the projection', async () => {
  const results = await Promise.allSettled([service.create(global, profile('100')), service.create(global, profile('100'))]);
  expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1);
  expect(await companyModel(connection).countDocuments({ documentNumber: '100' })).toBe(1);
  const broken: CompanyRepository = { ...repository, run: (write, action) => repository.run(write, tx => action({ ...tx, record: async () => { throw new Error('audit failed'); } })) };
  const companiesBefore = await companyModel(connection).countDocuments();
  const organizationsBefore = await connection.collection('organizations').countDocuments();
  await expect(serviceFor(broken).create(global, profile('101'))).rejects.toThrow('COMPANY_STORAGE_UNAVAILABLE');
  expect(await companyModel(connection).countDocuments()).toBe(companiesBefore);
  expect(await connection.collection('organizations').countDocuments()).toBe(organizationsBefore);
});

it.each(['policy', 'status'])('rejects a pending edit after a confirmed %s change', async kind => {
  await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, { $set: { grants: grantCeiling }, $inc: { version: 1 } });
  const first = await service.create(global, profile(kind === 'policy' ? '201' : '203'));
  let signal!: () => void; let resume!: () => void;
  const reached = new Promise<void>(resolve => { signal = resolve; }); const released = new Promise<void>(resolve => { resume = resolve; });
  let blocked = false;
  const pendingRepository = createCompanyRepository(async () => connection, (db, session) => {
    const participant = policyConfirmation(db, session);
    return { ...participant, async read() { const policy = await participant.read(); if (!blocked) { blocked = true; signal(); await released; } return policy; } };
  });
  const pending = serviceFor(pendingRepository).update(global, first.company.id, first.version, { city: 'No debe persistir' });
  const outcome = pending.then(() => 'allowed', error => error.message);
  await reached;
  if (kind === 'policy') await connection.collection('authorization_policies').updateOne({ _id: 'active' as never }, { $set: { grants: grantCeiling.filter(grant => grant.permission !== 'companies:update') }, $inc: { version: 1 } });
  else await service.setStatus(global, first.company.id, first.version, 'INACTIVE');
  resume();
  expect(await outcome).toBe(kind === 'policy' ? 'FORBIDDEN' : 'COMPANY_VERSION_CONFLICT');
  expect((await service.get(global, first.company.id)).company.city).toBeNull();
  expect(await connection.collection('company_management_events').countDocuments({ companyId: first.company.id, action: 'COMPANY_UPDATED' })).toBe(0);
});

it('validates real HTTP DTO, filters, versions and safe errors', async () => {
  const request = (query: string, body?: unknown) => new Request('http://localhost/api/companies?' + query, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}) });
  expect((await companyResponse(service, 'list', global.actor, request(''))).status).toBe(400);
  expect((await companyResponse(service, 'list', global.actor, request('scope=global&pageSize=101'))).status).toBe(400);
  expect((await companyResponse(service, 'list', global.actor, request('scope=global&scope=global'))).status).toBe(400);
  expect((await companyResponse(service, 'create', global.actor, request('scope=global', { ...profile('900'), createdBy: 'forged' }))).status).toBe(400);
  const response = await companyResponse(service, 'create', global.actor, request('scope=global', profile('900')));
  expect(response.status).toBe(201); expect(response.headers.get('Cache-Control')).toBe('no-store');
  const created = await response.json();
  expect(response.headers.get('Location')).toBe('/api/companies/' + created.company.id);
  const duplicate = await companyResponse(service, 'create', global.actor, request('scope=global', profile('900')));
  expect(duplicate.status).toBe(409);
  expect((await duplicate.json()).error.code).toBe('COMPANY_DOCUMENT_CONFLICT');
});
