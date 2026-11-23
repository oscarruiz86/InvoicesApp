import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createInvoice } from '@/modules/invoices/domain/invoice';
import { createInvoices } from '@/modules/invoices/application/invoices';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { createMongoInvoiceRepository, createMongoInvoiceAudit } from '@/modules/invoices/infrastructure/mongodb/invoice-repository';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { invoiceAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/invoice-authority';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';
import { createMongoParameterRepository } from '@/modules/configuration/infrastructure/mongodb/parameter-repository';
import { createParameterUseCases } from '@/modules/configuration/application/parameters';
import { createLocalInvoiceImageStorage } from '@/modules/invoices/infrastructure/images/local-image-storage';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `invoice_management_${randomUUID().replaceAll('-', '')}_test`;
const storageRoot = path.join(os.tmpdir(), `invoice-image-integration-${randomUUID()}`);
const imageStorage = createLocalInvoiceImageStorage(storageRoot);
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const connect = async () => connection;
let policyVersion = '1', failAudit = false;
let serverNow = new Date('2026-11-20T12:30:00.000Z');
let onEditPolicyConfirm: (() => void | Promise<void>) | null = null;
const parameters = createMongoParameterRepository(connect, undefined, policyConfirmation);
const parameterUseCases = createParameterUseCases(parameters, { now: () => new Date(serverNow) }, { next: randomUUID });
const assignments = createMongoInvoiceAssignmentAuthority(connect);
const repository = createMongoInvoiceRepository(connect, (c, session) => ({ policy: policyConfirmation(c, session),
  authority: invoiceAuthorityConfirmation(c, session), assignments,
  editPolicy: { async confirm() { onEditPolicyConfirm?.(); } },
  audit: { async record(event) { if (failAudit) throw new Error('simulated durable audit failure'); await createMongoInvoiceAudit(c, session).record(event); } },
}), { clock: { now: () => new Date(serverNow) } });
const configuredRepository = createMongoInvoiceRepository(connect, (c, session) => ({ policy: policyConfirmation(c, session),
  authority: invoiceAuthorityConfirmation(c, session), assignments,
  editPolicy: { async confirm(input) { await parameterUseCases.confirm({ thirdPartyId: input.thirdPartyId, revision: input.revision, scope: input.scope, transactionContext: input.transactionContext }); await onEditPolicyConfirm?.(); } },
  audit: createMongoInvoiceAudit(c, session),
}), { clock: { now: () => new Date(serverNow) } });

beforeAll(async () => { await connection.asPromise(); policyVersion = (await createPolicyRepository(connect).initialize()).version; });
beforeEach(() => { serverNow = new Date('2026-11-20T12:30:00.000Z'); onEditPolicyConfirm = null; });
afterAll(async () => { if (connection.readyState === 1 && /^invoice_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); await rm(storageRoot, { recursive: true, force: true }); });

async function seed() {
  const thirdPartyId = new mongoose.Types.ObjectId().toString(), vehicleId = new mongoose.Types.ObjectId().toString();
  const assignmentId = new mongoose.Types.ObjectId().toString(), driverId = new mongoose.Types.ObjectId().toString();
  const subject = randomUUID(), membershipId = randomUUID(), now = new Date(serverNow);
  await connection.collection('organizations').insertOne({ id: thirdPartyId, type: 'THIRD_PARTY', active: true, revision: 1 });
  await connection.collection('third_parties').insertOne({ _id: new mongoose.Types.ObjectId(thirdPartyId), status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_memberships').insertOne({ id: membershipId, subject, organizationId: thirdPartyId, status: 'ACTIVE', revision: 1 });
  await connection.collection('organization_associations').insertOne({ id: randomUUID(), membershipId, subject, organizationId: thirdPartyId,
    capability: 'DRIVER', assigned: true, active: true, revision: 1 });
  await connection.collection('drivers').insertOne({ _id: new mongoose.Types.ObjectId(driverId), membershipId, subject, thirdPartyId, status: 'ACTIVE', version: 1 });
  await connection.collection('vehicles').insertOne({ _id: new mongoose.Types.ObjectId(vehicleId), thirdPartyId, plate: 'ABC123', status: 'ACTIVE', version: 1 });
  await connection.collection('vehicle_assignments').insertOne({ _id: new mongoose.Types.ObjectId(assignmentId), thirdPartyId, vehicleId, driverId,
    subject, status: 'ACTIVE', version: 1, startedAt: now });
  const assignment = await assignments.readOwnActive({ actorSubject: subject, thirdPartyId, assignmentId, vehicleId });
  if (!assignment) throw new Error('Seed assignment was not eligible');
  const authority = { roles: ['DRIVER'] as const, policyVersion, contextRevision: 'context-1' };
  return { thirdPartyId, subject, vehicleId, assignmentId, driverId, assignment, authority };
}

let sequence = 1;
function command(owner: Awaited<ReturnType<typeof seed>>, options: { number?: string; idempotencyKey?: string; image?: boolean; createdAt?: Date } = {}) {
  const number = options.number ?? `FAC-${sequence++}`, now = options.createdAt ?? new Date('2026-11-20T12:00:00Z');
  const imageId = options.image ? new mongoose.Types.ObjectId().toString() : null;
  const invoice = createInvoice({ id: new mongoose.Types.ObjectId().toString(), ownerSubject: owner.subject, thirdPartyId: owner.thirdPartyId,
    assignmentId: owner.assignmentId, driverId: owner.driverId, vehicleId: owner.vehicleId, vehiclePlate: 'ABC123', invoiceDate: '2026-11-20',
    invoiceTime: '12:00:00', invoiceNumber: number, issuerNit: '900123456', buyerDocument: '900654321', amount: '100', vatAmount: '19',
    otherTaxesAmount: '0', totalAmount: '119', imageId, now });
  const imageData = options.image ? Buffer.from([1, 2, 3]) : undefined;
  const image = options.image ? { id: imageId!, data: imageData!, contentType: 'image/jpeg' as const, size: imageData!.length, width: 1, height: 1,
    sha256: createHash('sha256').update(imageData!).digest('hex') } : undefined;
  return { invoice, ...(image ? { image } : {}), actorSubject: owner.subject, idempotencyKey: options.idempotencyKey ?? randomUUID(),
    requestHash: `${owner.thirdPartyId}:${number}:${image?.sha256 ?? 'no-image'}`, authority: owner.authority, assignment: owner.assignment,
    correlationId: randomUUID() };
}

async function createWithImage(input: ReturnType<typeof command>, targetRepository: typeof repository = repository) {
  if (!input.image) return targetRepository.create({ invoice: input.invoice, actorSubject: input.actorSubject, idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash, authority: input.authority, assignment: input.assignment, correlationId: input.correlationId });
  const prepared = await imageStorage.prepare({ image: input.image, companyId: '0'.repeat(24), thirdPartyId: input.invoice.thirdPartyId,
    vehicleId: input.invoice.vehicleId, invoiceId: input.invoice.id });
  await imageStorage.commit(prepared);
  try {
    const created = await targetRepository.create({ ...input, image: { id: input.image.id, reference: prepared.reference } });
    if (created.id === input.invoice.id) await imageStorage.finalize(prepared); else await imageStorage.compensate(prepared);
    return created;
  } catch (error) { await imageStorage.compensate(prepared); throw error; }
}

it('runs initialization, administrative parameter change, MANUAL invoice edit, and history with Mongo adapters', async () => {
  serverNow = new Date();
  expect(await parameters.initialize('technical:test', randomUUID())).toBe(true);
  const initial = await parameters.find('invoice.manual-edit-window-seconds');
  expect(initial).toMatchObject({ value: 43200, version: 1 });
  const effectiveFrom = new Date(serverNow.getTime() - 60_000);
  await connection.collection('functional_parameters').updateOne({ key: initial!.key }, { $set: { effectiveFrom } });
  expect(await parameterUseCases.readEffective('0123456789abcdef01234567')).toMatchObject({ state: 'AVAILABLE', policy: { durationSeconds: 43200 } });

  const changed = await parameters.update({ key: initial!.key, expectedVersion: initial!.version, value: 1800, actor: 'admin:test', correlationId: randomUUID(), policyVersion });
  serverNow = new Date(changed.effectiveFrom.getTime() + 1);
  const history = await parameters.history(initial!.key, 1, 100);
  expect(changed).toMatchObject({ value: 1800, version: 2 });
  expect(history).toMatchObject({ total: 2, items: expect.arrayContaining([expect.objectContaining({ previousValue: 43200, value: 1800, actor: 'admin:test' })]) });

  const owner = await seed();
  const recentAt = new Date(serverNow.getTime() - 10 * 60_000);
  const recent = await createWithImage(command(owner, { number: 'FAC-NEW-WINDOW', createdAt: recentAt }), configuredRepository);
  const activePolicy = await parameterUseCases.readEffective(owner.thirdPartyId);
  if (activePolicy.state !== 'AVAILABLE') throw new Error('Configuration not effective');
  await expect(configuredRepository.edit({ ...editInput(owner, recent, 'FAC-NEW-WINDOW-EDIT'), editPolicy: activePolicy.policy }))
    .resolves.toMatchObject({ invoiceNumber: 'FAC-NEW-WINDOW-EDIT', version: 2 });

  const oldAt = new Date(serverNow.getTime() - 31 * 60_000);
  const oldInvoice = await createWithImage(command(owner, { number: 'FAC-OLD-WINDOW', createdAt: oldAt }), configuredRepository);
  const policy = await parameterUseCases.readEffective(owner.thirdPartyId);
  if (policy.state !== 'AVAILABLE') throw new Error('Configuration not effective');
  await expect(configuredRepository.edit({ ...editInput(owner, oldInvoice, 'FAC-OLD-WINDOW-EDIT'), editPolicy: { state: 'AVAILABLE', revision: policy.policy.revision,
    scope: 'global', validFrom: policy.policy.validFrom, validUntil: policy.policy.validUntil, durationSeconds: policy.policy.durationSeconds } }))
    .rejects.toMatchObject({ code: 'EDIT_WINDOW_CLOSED' });
});

it('serializes a live invoice edit against a concurrent parameter revision change', async () => {
  serverNow = new Date();
  const currentPolicy = await parameterUseCases.readEffective('0123456789abcdef01234567');
  if (currentPolicy.state !== 'AVAILABLE') throw new Error('Configuration not effective');
  const owner = await seed();
  const current = await createWithImage(command(owner, { number: 'FAC-POLICY-RACE', createdAt: new Date(serverNow.getTime() - 60_000) }), configuredRepository);
  const input = { ...editInput(owner, current, 'FAC-POLICY-RACE-EDIT'), editPolicy: currentPolicy.policy };
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; });
  let pauseOnce = true;
  onEditPolicyConfirm = async () => { if (pauseOnce) { pauseOnce = false; entered(); await barrier; } };
  const edit = configuredRepository.edit(input);
  await waiting;
  const update = parameters.update({ key: 'invoice.manual-edit-window-seconds', expectedVersion: Number(currentPolicy.policy.revision),
    value: currentPolicy.policy.durationSeconds === 3600 ? 7200 : 3600, actor: 'admin:race', correlationId: randomUUID(), policyVersion });
  release();
  const [editResult, updateResult] = await Promise.allSettled([edit, update]);
  onEditPolicyConfirm = null;
  expect(updateResult.status).toBe('fulfilled');
  const invoice = await configuredRepository.find({ id: current.id, thirdPartyId: owner.thirdPartyId });
  const events = await connection.collection('invoice_management_events').countDocuments({ invoiceId: current.id, action: 'INVOICE_UPDATED' });
  if (editResult.status === 'fulfilled') {
    expect(invoice).toMatchObject({ version: 2, invoiceNumber: 'FAC-POLICY-RACE-EDIT' });
    expect(events).toBe(1);
  } else {
    expect(editResult.reason).toMatchObject({ code: 'EDIT_POLICY_UNAVAILABLE' });
    expect(invoice).toMatchObject({ version: 1, invoiceNumber: 'FAC-POLICY-RACE' });
    expect(events).toBe(0);
  }
});

function editInput(owner: Awaited<ReturnType<typeof seed>>, current: Awaited<ReturnType<typeof repository.create>>, invoiceNumber: string) {
  return { current, next: { ...current, invoiceNumber, version: current.version + 1, updatedAt: new Date(serverNow) },
    editPolicy: { state: 'AVAILABLE' as const, revision: 'r1', scope: owner.thirdPartyId, validFrom: new Date(0), validUntil: null, durationSeconds: 43200 },
    actorSubject: owner.subject, expectedVersion: current.version, authority: owner.authority, correlationId: randomUUID() };
}

it('deduplicates identical retries and rejects duplicate business keys and stale versions', async () => {
  const owner = await seed(), first = command(owner, { number: 'FAC-RETRY', idempotencyKey: 'same-key' });
  const created = await createWithImage(first);
  await expect(createWithImage(first)).resolves.toMatchObject({ id: created.id, version: 1 });
  await expect(createWithImage({ ...first, requestHash: 'different-content' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  const duplicate = command(owner, { number: 'FAC-RETRY' });
  await expect(createWithImage(duplicate)).rejects.toMatchObject({ code: 'INVOICE_DUPLICATE' });

  const next = { ...created, invoiceNumber: 'FAC-UPDATED', version: 2, updatedAt: new Date() };
  const updated = await repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() });
  expect(updated).toMatchObject({ version: 2, invoiceNumber: 'FAC-UPDATED' });
  await expect(repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() })).rejects.toMatchObject({ code: 'INVOICE_VERSION_CONFLICT' });
});

it('stores manual and QR images as external references and reads their bytes through storage', async () => {
  const owner = await seed();
  const manualInput = command(owner, { number: 'FAC-EXTERNAL-MANUAL', image: true });
  const manual = await createWithImage(manualInput);
  const manualDocument = await connection.collection('invoice_images').findOne({ invoiceId: manual.id });
  expect(manualDocument).toMatchObject({ schemaVersion: 1, provider: 'local', contentType: manualInput.image!.contentType, size: manualInput.image!.size });
  expect(manualDocument).not.toHaveProperty('data');
  const manualReference = await repository.readImageReference({ invoice: manual });
  expect(manualReference).toMatchObject({ sha256: manualInput.image!.sha256, contentType: manualInput.image!.contentType });
  await expect(imageStorage.read(manualReference!)).resolves.toEqual(manualInput.image!.data);

  const qrBase = command(owner, { number: 'FAC-EXTERNAL-QR', image: true });
  const qr = { ...qrBase, invoice: { ...qrBase.invoice, origin: 'QR' as const,
    qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'e'.repeat(64), cufe: 'f'.repeat(96) } }, requestHash: 'qr-with-image' };
  const qrInvoice = await createWithImage(qr);
  const qrDocument = await connection.collection('invoice_images').findOne({ invoiceId: qrInvoice.id });
  expect(qrDocument).toMatchObject({ schemaVersion: 1, provider: 'local' });
  expect(qrDocument).not.toHaveProperty('data');
  const qrReference = await repository.readImageReference({ invoice: qrInvoice });
  await expect(imageStorage.read(qrReference!)).resolves.toEqual(qr.image!.data);
});

it('rejects legacy binary image documents without falling back to MongoDB bytes', async () => {
  const owner = await seed(), input = command(owner, { number: 'FAC-LEGACY-IMAGE', image: true });
  const created = await createWithImage(input);
  await connection.collection('invoice_images').replaceOne({ invoiceId: created.id }, { _id: new mongoose.Types.ObjectId(input.image!.id),
    invoiceId: created.id, data: input.image!.data, contentType: input.image!.contentType });
  await expect(repository.readImageReference({ invoice: created })).rejects.toMatchObject({ code: 'INVOICE_STORAGE_UNAVAILABLE' });
});

it('stores QR and MANUAL origins together, enforces business and CUFE uniqueness, and rolls back QR audit failures', async () => {
  const owner = await seed();
  const manual = command(owner, { number: 'FAC-CROSS-ORIGIN' });
  await createWithImage(manual);
  const base = command(owner, { number: 'FAC-QR-CUFE', idempotencyKey: 'qr-identical-retry' });
  const qr = { ...base, invoice: { ...base.invoice, origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const,
    contentHash: 'a'.repeat(64), cufe: 'b'.repeat(96), sourceUrl: 'https://example.test/qr' } }, requestHash: 'qr-content-hash' };
  const created = await createWithImage(qr);
  await expect(createWithImage(qr)).resolves.toMatchObject({ id: created.id, origin: 'QR', qrMetadata: { cufe: 'b'.repeat(96) } });
  await expect(createWithImage({ ...qr, requestHash: 'changed-qr-content-or-attachment' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(await connection.collection('invoices').findOne({ _id: new mongoose.Types.ObjectId(created.id) })).toMatchObject({ origin: 'QR' });
  const event = await connection.collection('invoice_management_events').findOne({ invoiceId: created.id });
  expect(event).not.toHaveProperty('qrContent'); expect(event).not.toHaveProperty('document');

  const commercialCollision = { ...command(owner, { number: 'FAC-CROSS-ORIGIN' }),
    invoice: { ...manual.invoice, origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'c'.repeat(64) } } };
  await expect(createWithImage(commercialCollision)).rejects.toMatchObject({ code: 'INVOICE_DUPLICATE' });
  const cufeCollision = { ...command(owner, { number: 'FAC-QR-DIFFERENT' }),
    invoice: { ...qr.invoice, id: new mongoose.Types.ObjectId().toString(), invoiceNumber: 'FAC-QR-DIFFERENT' } };
  await expect(createWithImage(cufeCollision)).rejects.toMatchObject({ code: 'INVOICE_DUPLICATE' });

  const failed = { ...command(owner, { number: 'FAC-QR-AUDIT-ROLLBACK' }),
    invoice: { ...qr.invoice, id: new mongoose.Types.ObjectId().toString(), invoiceNumber: 'FAC-QR-AUDIT-ROLLBACK', qrMetadata: { ...qr.invoice.qrMetadata,
      contentHash: 'd'.repeat(64), cufe: undefined } } };
  failAudit = true;
  try { await expect(createWithImage(failed)).rejects.toMatchObject({ code: 'INVOICE_AUDIT_UNAVAILABLE' }); }
  finally { failAudit = false; }
  expect(await connection.collection('invoices').countDocuments({ _id: new mongoose.Types.ObjectId(failed.invoice.id) })).toBe(0);
  expect(await connection.collection('invoice_management_events').countDocuments({ invoiceId: failed.invoice.id })).toBe(0);
});

it('rejects QR creation when its own many-to-many assignment closes after preview but before transaction confirmation', async () => {
  const owner = await seed(); let signalRead!: () => void, releaseRead!: () => void;
  const readCompleted = new Promise<void>(resolve => { signalRead = resolve; }), continueRead = new Promise<void>(resolve => { releaseRead = resolve; });
  const guardedAssignments = { async readOwnActive(input: Parameters<typeof assignments.readOwnActive>[0]) {
    const facts = await assignments.readOwnActive(input); signalRead(); await continueRead; return facts;
  } };
  const useCases = createInvoices({ repository, imageStorage, imageStorageCompanyId: () => '0'.repeat(24), authorization: { authorize: async () => owner.authority }, assignments: guardedAssignments,
    editPolicy: { read: async () => ({ state: 'UNAVAILABLE' as const }) }, imageNormalizer: { normalize: async () => { throw new Error('unused'); } },
    clock: { now: () => new Date(serverNow) }, ids: { next: () => new mongoose.Types.ObjectId().toString() }, correlationId: { next: randomUUID },
    qrContentHasher: { sha256: () => 'a'.repeat(64) } });
  const actor: AuthenticatedActor = { subject: owner.subject, username: null, name: null, email: null, roles: ['DRIVER'], permissions: [] };
  const create = useCases.createQr(actor, { thirdPartyId: owner.thirdPartyId, assignmentId: owner.assignmentId, vehicleId: owner.vehicleId,
    qrContent: 'NumFac=QR-RACE\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=900123456\nDocAdq=900654321\nValFac=100\nValIva=19\nValOtroIm=0\nValTolFac=119',
    idempotencyKey: 'qr-assignment-race' });
  await readCompleted;
  await connection.collection('vehicle_assignments').updateOne({ _id: new mongoose.Types.ObjectId(owner.assignmentId) }, { $set: { status: 'CLOSED', endedAt: new Date(serverNow) }, $inc: { version: 1 } });
  releaseRead();
  await expect(create).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_ELIGIBLE' });
  expect(await connection.collection('invoices').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
  expect(await connection.collection('invoice_management_events').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
});

it('rejects QR creation when the driver membership is revoked after parsing but before transaction confirmation', async () => {
  const owner = await seed(); let signalRead!: () => void, releaseRead!: () => void;
  const readCompleted = new Promise<void>(resolve => { signalRead = resolve; }), continueRead = new Promise<void>(resolve => { releaseRead = resolve; });
  const guardedAssignments = { async readOwnActive(input: Parameters<typeof assignments.readOwnActive>[0]) {
    const facts = await assignments.readOwnActive(input); signalRead(); await continueRead; return facts;
  } };
  const useCases = createInvoices({ repository, imageStorage, imageStorageCompanyId: () => '0'.repeat(24), authorization: { authorize: async () => owner.authority }, assignments: guardedAssignments,
    editPolicy: { read: async () => ({ state: 'UNAVAILABLE' as const }) }, imageNormalizer: { normalize: async () => { throw new Error('unused'); } },
    clock: { now: () => new Date(serverNow) }, ids: { next: () => new mongoose.Types.ObjectId().toString() }, correlationId: { next: randomUUID },
    qrContentHasher: { sha256: () => 'a'.repeat(64) } });
  const actor: AuthenticatedActor = { subject: owner.subject, username: null, name: null, email: null, roles: ['DRIVER'], permissions: [] };
  const create = useCases.createQr(actor, { thirdPartyId: owner.thirdPartyId, assignmentId: owner.assignmentId, vehicleId: owner.vehicleId,
    qrContent: 'NumFac=QR-REVOKED\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=900123456\nDocAdq=900654321\nValFac=100\nValIva=19\nValOtroIm=0\nValTolFac=119',
    idempotencyKey: 'qr-membership-revoke' });
  await readCompleted;
  await connection.collection('organization_memberships').updateOne({ subject: owner.subject }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
  releaseRead();
  await expect(create).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await connection.collection('invoices').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
  expect(await connection.collection('invoice_management_events').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
});

it('arbitrates concurrent commercial duplicates through the unique index', async () => {
  const owner = await seed(), candidates = [command(owner, { number: 'FAC-RACE' }), command(owner, { number: 'FAC-RACE' })];
  const outcomes = await Promise.allSettled(candidates.map(candidate => createWithImage(candidate)));
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
  expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { code: 'INVOICE_DUPLICATE' } });
});

it('keeps invoice detail, list and count isolated to the selected third party and DRIVER subject', async () => {
  const ownerA = await seed(), ownerB = await seed();
  const created = await createWithImage(command(ownerA, { number: 'FAC-SCOPE-A' }));

  expect(await repository.find({ id: created.id, thirdPartyId: ownerB.thirdPartyId })).toBeNull();
  expect(await repository.find({ id: created.id, thirdPartyId: ownerA.thirdPartyId, ownerSubject: ownerB.subject })).toBeNull();
  await expect(repository.list({ thirdPartyId: ownerB.thirdPartyId, ownerSubject: ownerB.subject, page: 1, pageSize: 20,
    sort: 'createdAt', direction: 'desc' })).resolves.toMatchObject({ items: [], total: 0 });
  await expect(repository.list({ thirdPartyId: ownerA.thirdPartyId, ownerSubject: ownerB.subject, page: 1, pageSize: 20,
    sort: 'createdAt', direction: 'desc' })).resolves.toMatchObject({ items: [], total: 0 });
  await expect(repository.list({ thirdPartyId: ownerA.thirdPartyId, ownerSubject: ownerA.subject, page: 1, pageSize: 20,
    sort: 'createdAt', direction: 'desc' })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: created.id })] });
  expect(await connection.collection('invoice_management_events').countDocuments({ invoiceId: created.id })).toBe(1);
});

it('checks the edit window with server time after policy confirmation, including the exclusive expiry boundary', async () => {
  const owner = await seed();
  serverNow = new Date('2026-11-20T23:59:59.999Z');
  const openInvoice = await createWithImage(command(owner, { number: 'FAC-OPEN-BOUNDARY' }));
  await expect(repository.edit(editInput(owner, openInvoice, 'FAC-OPEN-EDIT'))).resolves.toMatchObject({ version: 2 });

  const boundaryInvoice = await createWithImage(command(owner, { number: 'FAC-CLOSED-BOUNDARY' }));
  serverNow = new Date('2026-11-20T23:59:59.999Z');
  onEditPolicyConfirm = () => { serverNow = new Date('2026-11-21T00:00:00.000Z'); };
  try {
    await expect(repository.edit(editInput(owner, boundaryInvoice, 'FAC-CLOSED-EDIT'))).rejects.toMatchObject({ code: 'EDIT_WINDOW_CLOSED' });
  } finally { onEditPolicyConfirm = null; serverNow = new Date('2026-11-20T12:30:00.000Z'); }
  expect(await repository.find({ id: boundaryInvoice.id, thirdPartyId: owner.thirdPartyId })).toMatchObject({ version: 1, invoiceNumber: 'FAC-CLOSED-BOUNDARY' });
});

it('rolls invoice and image back when audit fails and rejects edits after membership revocation', async () => {
  const owner = await seed(), failed = command(owner, { number: 'FAC-ROLLBACK', image: true });
  failAudit = true;
  try { await expect(createWithImage(failed)).rejects.toMatchObject({ code: 'INVOICE_AUDIT_UNAVAILABLE' }); }
  finally { failAudit = false; }
  expect(await connection.collection('invoices').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
  expect(await connection.collection('invoice_images').countDocuments({ invoiceId: failed.invoice.id })).toBe(0);

  const created = await createWithImage(command(owner, { number: 'FAC-REVOKE' }));
  const next = { ...created, invoiceNumber: 'FAC-REVOKED-EDIT', version: 2, updatedAt: new Date() };
  await connection.collection('organization_memberships').updateOne({ subject: owner.subject }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
  await expect(repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await repository.find({ id: created.id, thirdPartyId: owner.thirdPartyId })).toMatchObject({ version: 1, invoiceNumber: 'FAC-REVOKE' });
});

it('rolls an image replacement back with the invoice when audit fails', async () => {
  const owner = await seed(), initial = command(owner, { number: 'FAC-IMAGE-ROLLBACK', image: true });
  const created = await createWithImage(initial);
  const replacement = command(owner, { number: 'FAC-IMAGE-ROLLBACK', image: true });
  const next = { ...created, imageId: replacement.image!.id, version: 2, updatedAt: new Date() };
  const prepared = await imageStorage.prepare({ image: replacement.image!, companyId: '0'.repeat(24), thirdPartyId: owner.thirdPartyId,
    vehicleId: created.vehicleId, invoiceId: created.id });
  await imageStorage.commit(prepared);
  failAudit = true;
  try {
    await expect(repository.edit({ current: created, next, image: { id: replacement.image!.id, reference: prepared.reference }, editPolicy: { state: 'AVAILABLE', revision: 'r1',
      scope: owner.thirdPartyId, validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject,
      expectedVersion: 1, authority: owner.authority, correlationId: randomUUID() }))
      .rejects.toMatchObject({ code: 'INVOICE_AUDIT_UNAVAILABLE' });
  } finally { failAudit = false; await imageStorage.compensate(prepared); }
  expect(await repository.find({ id: created.id, thirdPartyId: owner.thirdPartyId })).toMatchObject({ version: 1, imageId: initial.image!.id });
  expect(await connection.collection('invoice_images').findOne({ _id: new mongoose.Types.ObjectId(initial.image!.id) })).not.toBeNull();
  expect(await connection.collection('invoice_images').findOne({ _id: new mongoose.Types.ObjectId(replacement.image!.id) })).toBeNull();
});

it('commits a replacement that changes JPEG to PNG and removes the old reference', async () => {
  const owner = await seed(), initial = command(owner, { number: 'FAC-IMAGE-EXTENSION', image: true });
  const created = await createWithImage(initial);
  const replacement = command(owner, { number: 'FAC-IMAGE-EXTENSION', image: true });
  const replacementBytes = Buffer.from('replacement-png');
  const replacementImage = { ...replacement.image!, data: replacementBytes, contentType: 'image/png' as const, size: replacementBytes.length,
    sha256: createHash('sha256').update(replacementBytes).digest('hex') };
  const next = { ...created, imageId: replacementImage.id, version: 2, updatedAt: new Date() };
  const oldReference = await repository.readImageReference({ invoice: created });
  const prepared = await imageStorage.prepare({ image: replacementImage, companyId: '0'.repeat(24), thirdPartyId: owner.thirdPartyId,
    vehicleId: created.vehicleId, invoiceId: created.id, previousReference: oldReference! });
  await imageStorage.commit(prepared);
  const updated = await repository.edit({ current: created, next, image: { id: replacementImage.id, reference: prepared.reference },
    editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId, validFrom: new Date(0), validUntil: null, durationSeconds: 3600 },
    actorSubject: owner.subject, expectedVersion: 1, authority: owner.authority, correlationId: randomUUID() });
  await imageStorage.finalize(prepared);
  expect(updated).toMatchObject({ version: 2, imageId: replacementImage.id });
  expect(await connection.collection('invoice_images').findOne({ invoiceId: created.id })).toMatchObject({ contentType: 'image/png', schemaVersion: 1 });
  expect(await connection.collection('invoice_images').findOne({ invoiceId: created.id })).not.toHaveProperty('data');
  await expect(imageStorage.read(prepared.reference)).resolves.toEqual(replacementBytes);
  await expect(imageStorage.read(oldReference!)).rejects.toThrow();
});
