import { describe, expect, it, vi } from 'vitest';
import { createInvoices, validateInvoiceListQuery } from '@/modules/invoices/application/invoices';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { createInvoice } from '@/modules/invoices/domain/invoice';

const actor: AuthenticatedActor = { subject: 'driver-subject', username: null, name: null, email: null, roles: ['DRIVER'], permissions: [] };
const query = { thirdPartyId: 'a'.repeat(24), page: 1, pageSize: 25, sort: 'createdAt' as const, direction: 'desc' as const };
const repo = { list: vi.fn(async () => ({ items: [], total: 0 })), find: vi.fn(async () => null), readImage: vi.fn(async () => null), create: vi.fn(), edit: vi.fn() };
const dependencies = (roles: readonly AuthenticatedActor['roles'][number][]) => ({
  repository: repo,
  authorization: { authorize: vi.fn(async () => ({ roles, policyVersion: 'p1', contextRevision: 'c1' })) },
  assignments: { readOwnActive: vi.fn() }, editPolicy: { read: vi.fn() }, imageNormalizer: { normalize: vi.fn() },
  clock: { now: () => new Date('2026-11-20T12:00:00Z') }, ids: { next: () => 'b'.repeat(24) }, correlationId: { next: () => 'correlation' }, qrContentHasher: { sha256: () => 'a'.repeat(64) },
});

describe('invoice application', () => {
  it('validates bounded pagination and supported sorts', () => {
    expect(() => validateInvoiceListQuery(query)).not.toThrow();
    expect(() => validateInvoiceListQuery({ ...query, pageSize: 101 })).toThrow('INVALID_REQUEST');
    expect(() => validateInvoiceListQuery({ ...query, sort: 'ownerSubject' as never })).toThrow('INVALID_REQUEST');
    expect(() => validateInvoiceListQuery({ ...query, dateFrom: '2026-12-01', dateTo: '2026-11-01' })).toThrow('INVALID_REQUEST');
  });

  it('applies a driver owner filter in the repository query after authorization', async () => {
    repo.list.mockClear();
    const invoices = createInvoices(dependencies(['DRIVER']));
    await invoices.list(actor, query);
    expect(repo.list).toHaveBeenCalledWith({ ...query, ownerSubject: actor.subject });
  });

  it('scopes detail and image lookups to the authorized driver before returning private bytes', async () => {
    const owned = createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'A-1', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: new Date() });
    repo.find.mockClear(); repo.readImage.mockClear(); repo.find.mockResolvedValue(owned as never);
    const deps = dependencies(['DRIVER']); deps.editPolicy.read = vi.fn(async () => ({ state: 'UNAVAILABLE' as const }));
    const invoices = createInvoices(deps);
    const result = await invoices.detail(actor, { id: owned.id, thirdPartyId: query.thirdPartyId });
    expect(result.invoice.id).toBe(owned.id);
    expect(repo.find).toHaveBeenCalledWith({ id: owned.id, thirdPartyId: query.thirdPartyId, ownerSubject: actor.subject });

    repo.find.mockResolvedValueOnce(null);
    await expect(invoices.image(actor, { id: owned.id, thirdPartyId: query.thirdPartyId })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(repo.readImage).not.toHaveBeenCalled();
  });

  it('does not grant application or company administrators implicit invoice access', async () => {
    const invoices = createInvoices(dependencies(['APP_ADMIN']));
    await expect(invoices.list(actor, query)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repo.list).not.toHaveBeenCalled();
  });

  it('returns edit policy unavailable without mutating an existing invoice', async () => {
    const createdAt = new Date('2026-11-20T11:59:00Z');
    repo.find.mockResolvedValueOnce(createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'A-1', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: createdAt }) as never);
    const deps = dependencies(['DRIVER']);
    deps.editPolicy.read = vi.fn(async () => ({ state: 'UNAVAILABLE' as const }));
    const invoices = createInvoices(deps);
    await expect(invoices.edit(actor, { id: 'f'.repeat(24), thirdPartyId: query.thirdPartyId, expectedVersion: 1, changes: { invoiceNumber: 'A-2' } }))
      .rejects.toMatchObject({ code: 'EDIT_POLICY_UNAVAILABLE' });
    expect(repo.edit).not.toHaveBeenCalled();
  });

  it('refuses QR invoice editing without consulting the functional parameter policy', async () => {
    const qr = { ...createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'QR-1', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: new Date('2026-11-20T11:59:00Z') }),
      origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64) } };
    repo.find.mockResolvedValueOnce(qr as never);
    const deps = dependencies(['DRIVER']); const invoices = createInvoices(deps);
    await expect(invoices.detail(actor, { id: qr.id, thirdPartyId: query.thirdPartyId })).resolves.toMatchObject({ editability: { reason: 'QR_IMMUTABLE' } });
    expect(deps.editPolicy.read).not.toHaveBeenCalled();
  });

  it.each([['DRIVER'], ['THIRD_PARTY_ADMIN']] as const)('returns QR_IMMUTABLE to an authorized %s before reading edit policy or changing its image', async role => {
    const qr = { ...createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00', invoiceNumber: 'QR-1', issuerNit: '0001',
      buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: new Date('2026-11-20T11:59:00Z') }),
      origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64) } };
    repo.find.mockResolvedValueOnce(qr as never);
    const deps = dependencies([role]); const invoices = createInvoices(deps);
    await expect(invoices.edit(actor, { id: qr.id, thirdPartyId: query.thirdPartyId, expectedVersion: qr.version, changes: { image: { data: Buffer.from([1]),
      contentType: 'image/jpeg', size: 1, width: 1, height: 1, sha256: 'a'.repeat(64) } } })).rejects.toMatchObject({ code: 'QR_IMMUTABLE' });
    expect(deps.editPolicy.read).not.toHaveBeenCalled(); expect(repo.edit).not.toHaveBeenCalled();
  });

  it('previews without writing and reparses QR content at creation instead of trusting client fields', async () => {
    repo.create.mockClear();
    const deps = dependencies(['DRIVER']); deps.assignments.readOwnActive = vi.fn(async () => ({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24),
      driverId: 'd'.repeat(24), vehiclePlate: 'ABC123', thirdPartyId: query.thirdPartyId, status: 'ACTIVE' }));
    const invoices = createInvoices(deps);
    const content = 'NumFac=QR-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=000123\nDocAdq=001234\nValFac=100.00\nValIva=19\nValOtroIm=0\nValTolFac=119.00';
    const preview = await invoices.previewQr(actor, { thirdPartyId: query.thirdPartyId, qrContent: content });
    expect(preview).toMatchObject({ invoiceNumber: 'QR-1', metadata: { parserVersion: 'invoice-key-value-v1' } });
    expect(repo.create).not.toHaveBeenCalled();
    const manipulated = { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), qrContent: content,
      idempotencyKey: 'qr-1', amount: '0', origin: 'MANUAL' } as unknown as Parameters<typeof invoices.createQr>[1];
    await expect(invoices.createQr(actor, manipulated)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await invoices.createQr(actor, { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), qrContent: content, idempotencyKey: 'qr-1' });
    expect(deps.assignments.readOwnActive).toHaveBeenCalledWith({ actorSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24) });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ invoice: expect.objectContaining({ origin: 'QR', invoiceNumber: 'QR-1',
      qrMetadata: expect.objectContaining({ contentHash: 'a'.repeat(64) }) }), idempotencyKey: 'qr-1' }));
    const originalHash = repo.create.mock.calls[0][0].requestHash;
    await invoices.createQr(actor, { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24),
      qrContent: content.replace('QR-1', 'QR-2'), idempotencyKey: 'qr-1' });
    const attachment = { data: Buffer.from([1]), contentType: 'image/png' as const, size: 1, width: 1, height: 1, sha256: 'f'.repeat(64) };
    await invoices.createQr(actor, { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24),
      qrContent: content, idempotencyKey: 'qr-1', image: attachment });
    expect(repo.create.mock.calls[1][0].requestHash).not.toBe(originalHash);
    expect(repo.create.mock.calls[2][0].requestHash).not.toBe(originalHash);
    expect(repo.create.mock.calls[2][0].image).toMatchObject({ sha256: attachment.sha256, contentType: attachment.contentType });
  });

  it('computes a normalized SHA-256 fingerprint outside the pure QR parser', async () => {
    const deps = dependencies(['DRIVER']);
    const invoices = createInvoices(deps);
    const content = 'NumFac=F-1\r\nFecFac=2026-11-20\r\nHorFac=12:30:00\r\nNitFac=000123\r\nDocAdq=001234\r\nValFac=100.00\r\nValIva=19\r\nValOtroIm=0\r\nValTolFac=119.00';
    const preview = await invoices.previewQr(actor, { thirdPartyId: query.thirdPartyId, qrContent: content });
    expect(preview.metadata.contentHash).toBe('a'.repeat(64));
  });
});
