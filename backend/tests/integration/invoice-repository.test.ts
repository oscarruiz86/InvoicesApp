import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInvoice } from '@/modules/invoices/domain/invoice';
import { createMongoInvoiceRepository, createMongoInvoiceAudit } from '@/modules/invoices/infrastructure/mongodb/invoice-repository';
import { createMongoInvoiceAssignmentAuthority } from '@/modules/fleet/infrastructure/mongodb/invoice-assignment-authority';
import { invoiceAuthorityConfirmation } from '@/modules/organizations/infrastructure/mongodb/invoice-authority';
import { createPolicyRepository, policyConfirmation } from '@/modules/identity/infrastructure/mongodb/policy-repository';

const uri = process.env.MONGODB_TEST_URI;
if (!uri || !new URL(uri).pathname.endsWith('_test')) throw new Error('Isolated _test database required');
const database = `invoice_management_${randomUUID().replaceAll('-', '')}_test`;
const connection = mongoose.createConnection(uri, { dbName: database, serverSelectionTimeoutMS: 5000 });
const connect = async () => connection;
let policyVersion = '1', failAudit = false;
const assignments = createMongoInvoiceAssignmentAuthority(connect);
const repository = createMongoInvoiceRepository(connect, (c, session) => ({ policy: policyConfirmation(c, session),
  authority: invoiceAuthorityConfirmation(c, session), assignments,
  editPolicy: { async confirm() {} },
  audit: { async record(event) { if (failAudit) throw new Error('simulated durable audit failure'); await createMongoInvoiceAudit(c, session).record(event); } },
}));

beforeAll(async () => { await connection.asPromise(); policyVersion = (await createPolicyRepository(connect).initialize()).version; });
afterAll(async () => { if (connection.readyState === 1 && /^invoice_management_[a-f0-9]{32}_test$/.test(database)) await connection.dropDatabase(); await connection.close(); });

async function seed() {
  const thirdPartyId = new mongoose.Types.ObjectId().toString(), vehicleId = new mongoose.Types.ObjectId().toString();
  const assignmentId = new mongoose.Types.ObjectId().toString(), driverId = new mongoose.Types.ObjectId().toString();
  const subject = randomUUID(), membershipId = randomUUID(), now = new Date();
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
function command(owner: Awaited<ReturnType<typeof seed>>, options: { number?: string; idempotencyKey?: string; image?: boolean } = {}) {
  const number = options.number ?? `FAC-${sequence++}`, now = new Date('2026-11-20T12:00:00Z');
  const imageId = options.image ? new mongoose.Types.ObjectId().toString() : null;
  const invoice = createInvoice({ id: new mongoose.Types.ObjectId().toString(), ownerSubject: owner.subject, thirdPartyId: owner.thirdPartyId,
    assignmentId: owner.assignmentId, driverId: owner.driverId, vehicleId: owner.vehicleId, vehiclePlate: 'ABC123', invoiceDate: '2026-11-20',
    invoiceTime: '12:00:00', invoiceNumber: number, issuerNit: '900123456', buyerDocument: '900654321', amount: '100', vatAmount: '19',
    otherTaxesAmount: '0', totalAmount: '119', imageId, now });
  const image = options.image ? { id: imageId!, data: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' as const, size: 3, width: 1, height: 1,
    sha256: 'a'.repeat(64) } : undefined;
  return { invoice, ...(image ? { image } : {}), actorSubject: owner.subject, idempotencyKey: options.idempotencyKey ?? randomUUID(),
    requestHash: `${owner.thirdPartyId}:${number}:${image?.sha256 ?? 'no-image'}`, authority: owner.authority, assignment: owner.assignment,
    correlationId: randomUUID() };
}

it('deduplicates identical retries and rejects duplicate business keys and stale versions', async () => {
  const owner = await seed(), first = command(owner, { number: 'FAC-RETRY', idempotencyKey: 'same-key' });
  const created = await repository.create(first);
  await expect(repository.create(first)).resolves.toMatchObject({ id: created.id, version: 1 });
  await expect(repository.create({ ...first, requestHash: 'different-content' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  const duplicate = command(owner, { number: 'FAC-RETRY' });
  await expect(repository.create(duplicate)).rejects.toMatchObject({ code: 'INVOICE_DUPLICATE' });

  const next = { ...created, invoiceNumber: 'FAC-UPDATED', version: 2, updatedAt: new Date() };
  const updated = await repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() });
  expect(updated).toMatchObject({ version: 2, invoiceNumber: 'FAC-UPDATED' });
  await expect(repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() })).rejects.toMatchObject({ code: 'INVOICE_VERSION_CONFLICT' });
});

it('arbitrates concurrent commercial duplicates through the unique index', async () => {
  const owner = await seed(), candidates = [command(owner, { number: 'FAC-RACE' }), command(owner, { number: 'FAC-RACE' })];
  const outcomes = await Promise.allSettled(candidates.map(candidate => repository.create(candidate)));
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
  expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { code: 'INVOICE_DUPLICATE' } });
});

it('rolls invoice and image back when audit fails and rejects edits after membership revocation', async () => {
  const owner = await seed(), failed = command(owner, { number: 'FAC-ROLLBACK', image: true });
  failAudit = true;
  try { await expect(repository.create(failed)).rejects.toMatchObject({ code: 'INVOICE_AUDIT_UNAVAILABLE' }); }
  finally { failAudit = false; }
  expect(await connection.collection('invoices').countDocuments({ thirdPartyId: owner.thirdPartyId })).toBe(0);
  expect(await connection.collection('invoice_images').countDocuments({ invoiceId: failed.invoice.id })).toBe(0);

  const created = await repository.create(command(owner, { number: 'FAC-REVOKE' }));
  const next = { ...created, invoiceNumber: 'FAC-REVOKED-EDIT', version: 2, updatedAt: new Date() };
  await connection.collection('organization_memberships').updateOne({ subject: owner.subject }, { $set: { status: 'INACTIVE' }, $inc: { revision: 1 } });
  await expect(repository.edit({ current: created, next, editPolicy: { state: 'AVAILABLE', revision: 'r1', scope: owner.thirdPartyId,
    validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject, expectedVersion: 1,
    authority: owner.authority, correlationId: randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await repository.find({ id: created.id, thirdPartyId: owner.thirdPartyId })).toMatchObject({ version: 1, invoiceNumber: 'FAC-REVOKE' });
});

it('rolls an image replacement back with the invoice when audit fails', async () => {
  const owner = await seed(), initial = command(owner, { number: 'FAC-IMAGE-ROLLBACK', image: true });
  const created = await repository.create(initial);
  const replacement = command(owner, { number: 'FAC-IMAGE-ROLLBACK', image: true });
  const next = { ...created, imageId: replacement.image!.id, version: 2, updatedAt: new Date() };
  failAudit = true;
  try {
    await expect(repository.edit({ current: created, next, image: replacement.image, editPolicy: { state: 'AVAILABLE', revision: 'r1',
      scope: owner.thirdPartyId, validFrom: new Date(0), validUntil: null, durationSeconds: 3600 }, actorSubject: owner.subject,
      expectedVersion: 1, authority: owner.authority, correlationId: randomUUID() }))
      .rejects.toMatchObject({ code: 'INVOICE_AUDIT_UNAVAILABLE' });
  } finally { failAudit = false; }
  expect(await repository.find({ id: created.id, thirdPartyId: owner.thirdPartyId })).toMatchObject({ version: 1, imageId: initial.image!.id });
  expect(await connection.collection('invoice_images').findOne({ _id: new mongoose.Types.ObjectId(initial.image!.id) })).not.toBeNull();
  expect(await connection.collection('invoice_images').findOne({ _id: new mongoose.Types.ObjectId(replacement.image!.id) })).toBeNull();
});
