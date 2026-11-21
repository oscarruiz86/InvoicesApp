import { randomUUID } from 'node:crypto';
import { Types, type ClientSession, type Connection } from 'mongoose';
import { InvoiceDomainError, normalizedInvoiceBusinessKey, type Invoice } from '../../domain/invoice';
import type { InvoiceAssignmentAuthority } from '@/modules/fleet/application/assignment-ports';
import type { InvoiceAuditEvent, InvoiceAuditPort, InvoicePage, InvoiceRepositoryPort,
  InvoiceImageContent, InvoiceImagePayload, InvoiceTransactionAuthorityPort, InvoiceEditPolicyConfirmationPort } from '../../application/invoice-ports';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import { inventoryInvoices } from './invoice-inventory';

const collectionName = 'invoices';
const imageCollectionName = 'invoice_images';
const idempotencyCollectionName = 'invoice_idempotency';
const eventCollectionName = 'invoice_management_events';
type Row = Record<string, unknown>;

export class InvoiceRepositoryError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'RESOURCE_NOT_FOUND' | 'INVOICE_VERSION_CONFLICT' | 'INVOICE_DUPLICATE'
    | 'IDEMPOTENCY_CONFLICT' | 'INVOICE_MIGRATION_REQUIRED' | 'INVOICE_STORAGE_UNAVAILABLE' | 'INVOICE_AUDIT_UNAVAILABLE'
    | 'ASSIGNMENT_NOT_ELIGIBLE' | 'ASSIGNMENT_EVIDENCE_UNAVAILABLE' | 'AUTHORIZATION_UNAVAILABLE' | 'EDIT_POLICY_UNAVAILABLE' | 'FORBIDDEN') { super(code); }
}

export interface InvoiceTransactionPorts {
  readonly policy: PolicyConfirmation;
  readonly authority: InvoiceTransactionAuthorityPort;
  readonly assignments: InvoiceAssignmentAuthority;
  readonly editPolicy: InvoiceEditPolicyConfirmationPort;
  readonly audit: InvoiceAuditPort;
}
export type InvoiceTransactionParticipants = (connection: Connection, session: ClientSession) => InvoiceTransactionPorts;

const validId = (value: string) => /^[a-f0-9]{24}$/.test(value);
const safeRegex = (value: string) => new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

function decimal(value: unknown): string {
  if (typeof value === 'string' || (value && typeof value === 'object' && 'toString' in value)) return String(value);
  throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
}

function decode(row: Row): Invoice {
  const amounts = row.amounts as Row | undefined;
  if (!(row._id instanceof Types.ObjectId) || typeof row.ownerSubject !== 'string' || !row.ownerSubject
    || ![row.thirdPartyId, row.assignmentId, row.driverId, row.vehicleId].every(value => typeof value === 'string' && validId(value))
    || !['MANUAL', 'QR'].includes(String(row.origin)) || typeof row.invoiceDate !== 'string' || typeof row.invoiceTime !== 'string' || typeof row.invoiceAtUtc !== 'string'
    || typeof row.invoiceNumber !== 'string' || typeof row.issuerNit !== 'string' || typeof row.buyerDocument !== 'string'
    || !amounts || !Number.isSafeInteger(row.version) || Number(row.version) < 1
    || !(row.createdAt instanceof Date) || !(row.updatedAt instanceof Date)) throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
  const imageId = row.imageId === undefined || row.imageId === null ? null : String(row.imageId);
  const qrMetadata = row.qrMetadata as Row | undefined;
  if (row.origin === 'QR' && (!qrMetadata || qrMetadata.parserVersion !== 'invoice-key-value-v1'
    || typeof qrMetadata.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(qrMetadata.contentHash))) throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
  return { id: row._id.toString(), origin: row.origin as Invoice['origin'], ...(row.origin === 'QR' ? { qrMetadata: qrMetadata as unknown as NonNullable<Invoice['qrMetadata']> } : {}), ownerSubject: row.ownerSubject, thirdPartyId: String(row.thirdPartyId),
    assignmentId: String(row.assignmentId), driverId: String(row.driverId), vehicleId: String(row.vehicleId),
    vehiclePlate: typeof row.vehiclePlate === 'string' ? row.vehiclePlate : null, invoiceDate: row.invoiceDate, invoiceTime: row.invoiceTime, invoiceAtUtc: row.invoiceAtUtc,
    invoiceNumber: row.invoiceNumber, issuerNit: row.issuerNit, buyerDocument: row.buyerDocument,
    amounts: { amount: decimal(amounts.amount), vatAmount: decimal(amounts.vatAmount), otherTaxesAmount: decimal(amounts.otherTaxesAmount), totalAmount: decimal(amounts.totalAmount) },
    imageId, version: Number(row.version), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function amountValue(value: string) { return Types.Decimal128.fromString(value); }
function encode(invoice: Invoice): Row {
  const { id, amounts, ...fields } = invoice;
  return { _id: new Types.ObjectId(id), ...fields, amounts: { amount: amountValue(amounts.amount), vatAmount: amountValue(amounts.vatAmount),
    otherTaxesAmount: amountValue(amounts.otherTaxesAmount), totalAmount: amountValue(amounts.totalAmount) } };
}

function mapError(error: unknown): never {
  if (error instanceof InvoiceRepositoryError) throw error;
  if (error instanceof InvoiceDomainError) throw new InvoiceRepositoryError('INVALID_REQUEST');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code)
    : error instanceof Error ? error.message : '';
  if (code === 'FORBIDDEN') throw new InvoiceRepositoryError('FORBIDDEN');
  if (code === 'AUTHORIZATION_UNAVAILABLE' || code === 'POLICY_UNAVAILABLE') throw new InvoiceRepositoryError('AUTHORIZATION_UNAVAILABLE');
  if (code === 'EDIT_POLICY_UNAVAILABLE') throw new InvoiceRepositoryError('EDIT_POLICY_UNAVAILABLE');
  if (code === 'ASSIGNMENT_NOT_ELIGIBLE' || code === 'ASSIGNMENT_EVIDENCE_UNAVAILABLE' || code === 'ASSIGNMENT_VERSION_CONFLICT')
    throw new InvoiceRepositoryError(code === 'ASSIGNMENT_VERSION_CONFLICT' ? 'ASSIGNMENT_NOT_ELIGIBLE' : code);
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    const keyPattern = 'keyPattern' in error ? error.keyPattern as Row : {};
    if (keyPattern.issuerNit || keyPattern.businessKey || keyPattern['qrMetadata.cufe']) throw new InvoiceRepositoryError('INVOICE_DUPLICATE');
    throw new InvoiceRepositoryError('IDEMPOTENCY_CONFLICT');
  }
  if (error instanceof Error && error.message === 'INVOICE_AUDIT_UNAVAILABLE') throw new InvoiceRepositoryError('INVOICE_AUDIT_UNAVAILABLE');
  throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
}

async function requireTransactions(connection: Connection): Promise<void> {
  try {
    if (!connection.db) throw new Error();
    const hello = await connection.db.admin().command({ hello: 1 });
    if ((!hello.setName && hello.msg !== 'isdbgrid') || hello.isWritablePrimary !== true) throw new Error();
  } catch { throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE'); }
}

const initialized = new WeakMap<Connection, Promise<void>>();
function ensureReady(connection: Connection): Promise<void> {
  let pending = initialized.get(connection);
  if (pending) return pending;
  pending = (async () => {
    const invoices = connection.collection(collectionName);
    // Automatic migration is intentionally forbidden: every existing row is checked before any index write.
    if (!(await inventoryInvoices(connection)).ready) throw new InvoiceRepositoryError('INVOICE_MIGRATION_REQUIRED');
    await Promise.all([
      invoices.createIndex({ thirdPartyId: 1, issuerNit: 1, invoiceNumber: 1 }, { unique: true, name: 'invoices_business_key_unique' }),
      invoices.createIndex({ thirdPartyId: 1, 'qrMetadata.cufe': 1 }, { unique: true, partialFilterExpression: { 'qrMetadata.cufe': { $type: 'string' } }, name: 'invoices_third_party_cufe_unique' }),
      invoices.createIndex({ thirdPartyId: 1, invoiceDate: -1, _id: 1 }, { name: 'invoices_third_party_date' }),
      invoices.createIndex({ thirdPartyId: 1, ownerSubject: 1, invoiceDate: -1, _id: 1 }, { name: 'invoices_owner_date' }),
      connection.collection(idempotencyCollectionName).createIndex({ thirdPartyId: 1, actorSubject: 1, key: 1 }, { unique: true, name: 'invoice_idempotency_actor_key_unique' }),
      connection.collection(imageCollectionName).createIndex({ invoiceId: 1 }, { unique: true, name: 'invoice_images_invoice_unique' }),
      connection.collection(eventCollectionName).createIndex({ eventId: 1 }, { unique: true, name: 'invoice_events_event_id_unique' }),
      connection.collection(eventCollectionName).createIndex({ thirdPartyId: 1, at: 1, eventId: 1 }, { name: 'invoice_events_timeline' }),
    ]);
  })().catch(error => { initialized.delete(connection); throw error; });
  initialized.set(connection, pending);
  return pending;
}

export function createMongoInvoiceAudit(connection: Connection, session: ClientSession): InvoiceAuditPort {
  return { async record(event: InvoiceAuditEvent) {
    await connection.collection(eventCollectionName).insertOne({ ...event, at: new Date(event.at) }, { session });
  } };
}

function imageDocument(invoice: Invoice, image: InvoiceImagePayload): Row {
  if (!validId(image.id) || image.id !== invoice.imageId || image.size < 1 || image.size > 5 * 1024 * 1024
    || image.data.byteLength !== image.size || !['image/jpeg', 'image/png'].includes(image.contentType)
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1
    || !/^[a-f0-9]{64}$/.test(image.sha256)) throw new InvoiceRepositoryError('INVALID_REQUEST');
  return { _id: new Types.ObjectId(image.id), invoiceId: invoice.id, contentType: image.contentType, size: image.size,
    width: image.width, height: image.height, sha256: image.sha256, data: Buffer.from(image.data) };
}

export function createMongoInvoiceRepository(connect: () => Promise<Connection>, participants: InvoiceTransactionParticipants): InvoiceRepositoryPort {
  async function transaction<T>(fn: (connection: Connection, session: ClientSession, ports: InvoiceTransactionPorts) => Promise<T>): Promise<T> {
    try {
      const connection = await connect(); await ensureReady(connection); await requireTransactions(connection);
      return await connection.transaction(async session => fn(connection, session, participants(connection, session)),
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
    } catch (error) { return mapError(error); }
  }
  const repo: InvoiceRepositoryPort = {
    async list(input): Promise<InvoicePage> {
      if (!validId(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize)
        || input.pageSize < 1 || input.pageSize > 100 || !['invoiceDate', 'invoiceNumber', 'totalAmount', 'createdAt'].includes(input.sort)
        || !['asc', 'desc'].includes(input.direction)) throw new InvoiceRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ensureReady(connection);
        const filter = { thirdPartyId: input.thirdPartyId, ...(input.ownerSubject ? { ownerSubject: input.ownerSubject } : {}),
          ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
          ...(input.dateFrom || input.dateTo ? { invoiceDate: { ...(input.dateFrom ? { $gte: input.dateFrom } : {}), ...(input.dateTo ? { $lte: input.dateTo } : {}) } } : {}),
          ...(input.q ? { $or: [{ invoiceNumber: safeRegex(input.q) }, { issuerNit: safeRegex(input.q) }] } : {}) };
        const direction: 1 | -1 = input.direction === 'asc' ? 1 : -1;
        const sortField = input.sort === 'totalAmount' ? 'amounts.totalAmount' : input.sort;
        const sort = { [sortField]: direction, _id: 1 as const };
        const [rows, total] = await Promise.all([
          connection.collection(collectionName).find(filter).sort(sort).skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(),
          connection.collection(collectionName).countDocuments(filter),
        ]);
        return { items: rows.map(row => decode(row as Row)), total };
      } catch (error) { return mapError(error); }
    },
    async find(input) {
      if (!validId(input.id) || !validId(input.thirdPartyId) || (input.ownerSubject !== undefined && !input.ownerSubject)) throw new InvoiceRepositoryError('INVALID_REQUEST');
      try {
        const connection = await connect(); await ensureReady(connection);
        const row = await connection.collection(collectionName).findOne({ _id: new Types.ObjectId(input.id), thirdPartyId: input.thirdPartyId,
          ...(input.ownerSubject ? { ownerSubject: input.ownerSubject } : {}) });
        return row ? decode(row as Row) : null;
      } catch (error) { return mapError(error); }
    },
    async readImage(input): Promise<InvoiceImageContent | null> {
      if (!input.invoice.imageId) return null;
      try {
        const connection = await connect(); await ensureReady(connection);
        const row = await connection.collection(imageCollectionName).findOne({ _id: new Types.ObjectId(input.invoice.imageId), invoiceId: input.invoice.id });
        if (!row || !Buffer.isBuffer(row.data) || !['image/jpeg', 'image/png'].includes(String(row.contentType))
          || typeof row.sha256 !== 'string' || !Number.isSafeInteger(row.size) || row.data.byteLength !== row.size) {
          throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
        }
        return { id: input.invoice.imageId, data: row.data, contentType: row.contentType as InvoiceImageContent['contentType'],
          size: Number(row.size), width: Number(row.width), height: Number(row.height), sha256: row.sha256 };
      } catch (error) { return mapError(error); }
    },
    async create(input) {
      if (!validId(input.invoice.id) || !validId(input.invoice.thirdPartyId) || !input.actorSubject || !input.idempotencyKey
        || input.idempotencyKey.length > 128 || input.assignment.assignmentId !== input.invoice.assignmentId
        || input.assignment.driverId !== input.invoice.driverId || input.assignment.vehicleId !== input.invoice.vehicleId) {
        throw new InvoiceRepositoryError('INVALID_REQUEST');
      }
      try {
        return await transaction(async (connection, session, ports) => {
          await ports.policy.confirm(input.authority.policyVersion);
          await ports.authority.confirm({ ...input.authority, actorSubject: input.actorSubject, thirdPartyId: input.invoice.thirdPartyId,
            requiredRole: 'DRIVER', transactionContext: { connection, session } });
          await ports.assignments.confirmInTransaction({ ...input.assignment, actorSubject: input.actorSubject,
            policyVersion: input.authority.policyVersion, contextRevision: input.authority.contextRevision, transactionContext: { connection, session } });
          const idempotent = await connection.collection(idempotencyCollectionName).findOne({ thirdPartyId: input.invoice.thirdPartyId,
            actorSubject: input.actorSubject, key: input.idempotencyKey }, { session });
          if (idempotent) {
            if (idempotent.requestHash !== input.requestHash) throw new InvoiceRepositoryError('IDEMPOTENCY_CONFLICT');
            const existing = typeof idempotent.invoiceId === 'string' ? await connection.collection(collectionName).findOne({
              _id: new Types.ObjectId(idempotent.invoiceId), thirdPartyId: input.invoice.thirdPartyId,
              ...(input.authority.roles.includes('DRIVER') ? { ownerSubject: input.actorSubject } : {}) }, { session }) : null;
            if (!existing) throw new InvoiceRepositoryError('INVOICE_STORAGE_UNAVAILABLE');
            return decode(existing as Row);
          }
          const businessKey = normalizedInvoiceBusinessKey(input.invoice.issuerNit, input.invoice.invoiceNumber);
          const candidate = await connection.collection(collectionName).findOne({ thirdPartyId: input.invoice.thirdPartyId,
            issuerNit: input.invoice.issuerNit, invoiceNumber: input.invoice.invoiceNumber }, { session });
          if (candidate) throw new InvoiceRepositoryError('INVOICE_DUPLICATE');
          if (input.image) await connection.collection(imageCollectionName).insertOne(imageDocument(input.invoice, input.image), { session });
          else if (input.invoice.imageId) throw new InvoiceRepositoryError('INVALID_REQUEST');
          await connection.collection(collectionName).insertOne({ ...encode(input.invoice), businessKey }, { session });
          await connection.collection(idempotencyCollectionName).insertOne({ thirdPartyId: input.invoice.thirdPartyId,
            actorSubject: input.actorSubject, key: input.idempotencyKey, requestHash: input.requestHash, invoiceId: input.invoice.id,
            createdAt: input.invoice.createdAt }, { session });
          try { await ports.audit.record({ eventId: randomUUID(), correlationId: input.correlationId, action: 'INVOICE_CREATED',
            actorSubject: input.actorSubject, invoiceId: input.invoice.id, thirdPartyId: input.invoice.thirdPartyId,
            at: input.invoice.createdAt.toISOString(), changedFields: ['assignmentId', 'invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amounts', 'imageId'] }); }
          catch { throw new InvoiceRepositoryError('INVOICE_AUDIT_UNAVAILABLE'); }
          return input.invoice;
        });
      } catch (error) {
        if (error instanceof InvoiceRepositoryError && error.code === 'IDEMPOTENCY_CONFLICT') {
          try {
            return await transaction(async (connection, session, ports) => {
              await ports.policy.confirm(input.authority.policyVersion);
              await ports.authority.confirm({ ...input.authority, actorSubject: input.actorSubject, thirdPartyId: input.invoice.thirdPartyId,
                requiredRole: 'DRIVER', transactionContext: { connection, session } });
              const idempotent = await connection.collection(idempotencyCollectionName).findOne({ thirdPartyId: input.invoice.thirdPartyId,
                actorSubject: input.actorSubject, key: input.idempotencyKey }, { session });
              if (!idempotent || idempotent.requestHash !== input.requestHash || typeof idempotent.invoiceId !== 'string')
                throw new InvoiceRepositoryError('IDEMPOTENCY_CONFLICT');
              const existing = await connection.collection(collectionName).findOne({ _id: new Types.ObjectId(idempotent.invoiceId),
                thirdPartyId: input.invoice.thirdPartyId, ownerSubject: input.actorSubject }, { session });
              if (!existing) throw new InvoiceRepositoryError('IDEMPOTENCY_CONFLICT');
              return decode(existing as Row);
            });
          } catch (retryError) { return mapError(retryError); }
        }
        return mapError(error);
      }
    },
    async edit(input) {
      if (!validId(input.current.id) || input.current.thirdPartyId !== input.next.thirdPartyId
        || input.current.version !== input.expectedVersion || input.next.version !== input.expectedVersion + 1) throw new InvoiceRepositoryError('INVALID_REQUEST');
      return transaction(async (connection, session, ports) => {
        await ports.policy.confirm(input.authority.policyVersion);
        await ports.authority.confirm({ ...input.authority, actorSubject: input.actorSubject, thirdPartyId: input.current.thirdPartyId,
          requiredRole: input.authority.roles.includes('DRIVER') ? 'DRIVER' : 'THIRD_PARTY_ADMIN', transactionContext: { connection, session } });
        await ports.editPolicy.confirm({ thirdPartyId: input.current.thirdPartyId, revision: input.editPolicy.revision,
          scope: input.editPolicy.scope, transactionContext: { connection, session } });
        const filter = { _id: new Types.ObjectId(input.current.id), thirdPartyId: input.current.thirdPartyId, version: input.expectedVersion,
          ...(input.authority.roles.includes('DRIVER') ? { ownerSubject: input.actorSubject } : {}) };
        const result = await connection.collection(collectionName).replaceOne(filter, { ...encode(input.next), businessKey: normalizedInvoiceBusinessKey(input.next.issuerNit, input.next.invoiceNumber) }, { session });
        if (result.modifiedCount !== 1) throw new InvoiceRepositoryError('INVOICE_VERSION_CONFLICT');
        if (input.image) {
          if (input.current.imageId) await connection.collection(imageCollectionName).deleteOne({ _id: new Types.ObjectId(input.current.imageId), invoiceId: input.current.id }, { session });
          await connection.collection(imageCollectionName).insertOne(imageDocument(input.next, input.image), { session });
        } else if (input.next.imageId !== input.current.imageId) throw new InvoiceRepositoryError('INVALID_REQUEST');
        const changedFields = ['invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amounts', 'imageId']
          .filter(field => field === 'amounts' ? JSON.stringify(input.current.amounts) !== JSON.stringify(input.next.amounts)
            : input.current[field as keyof Invoice] !== input.next[field as keyof Invoice]);
        if (changedFields.length) {
          try { await ports.audit.record({ eventId: randomUUID(), correlationId: input.correlationId, action: 'INVOICE_UPDATED',
            actorSubject: input.actorSubject, invoiceId: input.current.id, thirdPartyId: input.current.thirdPartyId,
            at: input.next.updatedAt.toISOString(), changedFields }); }
          catch { throw new InvoiceRepositoryError('INVOICE_AUDIT_UNAVAILABLE'); }
        }
        const row = await connection.collection(collectionName).findOne({ _id: new Types.ObjectId(input.current.id), thirdPartyId: input.current.thirdPartyId }, { session });
        return row ? decode(row as Row) : input.next;
      });
    },
  };
  return repo;
}
