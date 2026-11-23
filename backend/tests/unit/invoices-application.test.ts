import { describe, expect, it, vi } from 'vitest';
import { createInvoices, validateInvoiceListQuery } from '@/modules/invoices/application/invoices';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { createInvoice } from '@/modules/invoices/domain/invoice';
import type { InvoiceRepositoryPort, InvoiceImageStoragePort, InvoiceImageReference } from '@/modules/invoices/application/invoice-ports';

const actor: AuthenticatedActor = { subject: 'driver-subject', username: null, name: null, email: null, roles: ['DRIVER'], permissions: [] };
const query = { thirdPartyId: 'a'.repeat(24), page: 1, pageSize: 25, sort: 'createdAt' as const, direction: 'desc' as const };
const repo = { list: vi.fn(async () => ({ items: [], total: 0 })), find: vi.fn(async () => null),
  readImageReference: vi.fn(async () => null as InvoiceImageReference | null),
  create: vi.fn(async (input: Parameters<InvoiceRepositoryPort['create']>[0]) => input.invoice),
  edit: vi.fn(async (input: Parameters<InvoiceRepositoryPort['edit']>[0]) => input.next) };
const imageStorage = { prepare: vi.fn(async ({ image, companyId, thirdPartyId, vehicleId, invoiceId }: Parameters<InvoiceImageStoragePort['prepare']>[0]) => ({ operationId: 'op',
    reference: { provider: 'local' as const, key: `${companyId}/${thirdPartyId}/${vehicleId}/${invoiceId}/imagen.${image.contentType === 'image/png' ? 'png' : 'jpg'}`,
      contentType: image.contentType, size: image.size, width: image.width, height: image.height, sha256: image.sha256 } })),
  read: vi.fn(async () => Buffer.from([1])), commit: vi.fn(async () => {}), compensate: vi.fn(async () => {}), finalize: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
const dependencies = (roles: readonly AuthenticatedActor['roles'][number][]) => ({
  repository: repo,
  imageStorage, imageStorageCompanyId: () => 'a'.repeat(24),
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

  it('returns per-invoice editability for a driver using the configured time window', async () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const base = { id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00', invoiceNumber: 'A-1',
      issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10' };
    const open = createInvoice({ ...base, now: new Date(now.getTime() - 60_000) });
    const closed = createInvoice({ ...base, id: 'e'.repeat(24), invoiceNumber: 'A-2', now: new Date(now.getTime() - 43_201_000) });
    repo.list.mockResolvedValueOnce({ items: [open, closed], total: 2 } as never);
    const deps = dependencies(['DRIVER']);
    deps.clock.now = () => now;
    deps.editPolicy.read = vi.fn(async () => ({ state: 'AVAILABLE' as const, policy: { state: 'AVAILABLE' as const, revision: '1', scope: 'global',
      validFrom: new Date('2026-01-01T00:00:00Z'), validUntil: null, durationSeconds: 43_200 } }));
    const result = await createInvoices(deps).list(actor, query);
    expect(result.items.map(item => item.editability)).toEqual([
      { available: true, reason: null }, { available: false, reason: 'EDIT_WINDOW_CLOSED' },
    ]);
  });

  it('scopes detail and image lookups to the authorized driver before returning private bytes', async () => {
    const owned = createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'A-1', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: new Date() });
    repo.find.mockClear(); repo.readImageReference.mockClear(); repo.find.mockResolvedValue(owned as never);
    const deps = dependencies(['DRIVER']); deps.editPolicy.read = vi.fn(async () => ({ state: 'UNAVAILABLE' as const }));
    const invoices = createInvoices(deps);
    const result = await invoices.detail(actor, { id: owned.id, thirdPartyId: query.thirdPartyId });
    expect(result.invoice.id).toBe(owned.id);
    expect(repo.find).toHaveBeenCalledWith({ id: owned.id, thirdPartyId: query.thirdPartyId, ownerSubject: actor.subject });

    repo.find.mockResolvedValueOnce(null);
    await expect(invoices.image(actor, { id: owned.id, thirdPartyId: query.thirdPartyId })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(repo.readImageReference).not.toHaveBeenCalled();
  });

  it('reads external image bytes only after the scoped invoice reference is authorized', async () => {
    const imageId = '9'.repeat(24);
    const owned = createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'A-IMAGE', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', imageId, now: new Date() });
    const reference = { provider: 'local' as const, key: `${'a'.repeat(24)}/${query.thirdPartyId}/${owned.vehicleId}/${owned.id}/imagen.jpg`,
      contentType: 'image/jpeg' as const, size: 3, width: 1, height: 1, sha256: 'b'.repeat(64) };
    repo.find.mockResolvedValueOnce(owned as never); repo.readImageReference.mockResolvedValueOnce(reference);
    imageStorage.read.mockResolvedValueOnce(Buffer.from('img'));
    const deps = dependencies(['DRIVER']); deps.editPolicy.read = vi.fn(async () => ({ state: 'UNAVAILABLE' as const }));
    const result = await createInvoices(deps).image(actor, { id: owned.id, thirdPartyId: query.thirdPartyId });
    expect(repo.find).toHaveBeenCalledWith({ id: owned.id, thirdPartyId: query.thirdPartyId, ownerSubject: actor.subject });
    expect(imageStorage.read).toHaveBeenCalledWith(reference);
    expect(result).toMatchObject({ id: imageId, data: Buffer.from('img'), contentType: 'image/jpeg' });
  });

  it('compensates an activated image when invoice persistence fails', async () => {
    const deps = dependencies(['DRIVER']);
    deps.assignments.readOwnActive = vi.fn(async () => ({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), driverId: 'd'.repeat(24),
      vehiclePlate: 'ABC123', thirdPartyId: query.thirdPartyId, status: 'ACTIVE' }));
    repo.create.mockRejectedValueOnce(new Error('database unavailable'));
    const image = { data: Buffer.from('image'), contentType: 'image/png' as const, size: 5, width: 1, height: 1, sha256: 'c'.repeat(64) };
    await expect(createInvoices(deps).create(actor, { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24),
      invoiceDate: '2026-11-20', invoiceTime: '12:00:00', invoiceNumber: 'A-2', issuerNit: '0001', buyerDocument: '123',
      amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', image, idempotencyKey: 'image-rollback' }))
      .rejects.toMatchObject({ code: 'INVOICE_STORAGE_UNAVAILABLE' });
    expect(imageStorage.prepare).toHaveBeenCalledTimes(1); expect(imageStorage.commit).toHaveBeenCalledTimes(1);
    expect(imageStorage.compensate).toHaveBeenCalledTimes(1);
  });

  it('reports missing image storage configuration with the neutral configuration code', async () => {
    const deps = dependencies(['DRIVER']);
    deps.assignments.readOwnActive = vi.fn(async () => ({ assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24), driverId: 'd'.repeat(24),
      vehiclePlate: 'ABC123', thirdPartyId: query.thirdPartyId, status: 'ACTIVE' }));
    deps.imageStorageCompanyId = () => { throw new Error('CONFIGURATION_ERROR'); };
    const image = { data: Buffer.from('image'), contentType: 'image/png' as const, size: 5, width: 1, height: 1, sha256: 'c'.repeat(64) };
    await expect(createInvoices(deps).create(actor, { thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24), vehicleId: 'e'.repeat(24),
      invoiceDate: '2026-11-20', invoiceTime: '12:00:00', invoiceNumber: 'A-3', issuerNit: '0001', buyerDocument: '123',
      amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', image, idempotencyKey: 'missing-storage-config' }))
      .rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(imageStorage.prepare).not.toHaveBeenCalled();
  });

  it('activates and retires image versions around an authorized invoice replacement', async () => {
    const current = createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId,
      assignmentId: 'c'.repeat(24), driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00',
      invoiceNumber: 'A-OLD', issuerNit: '0001', buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10',
      imageId: '8'.repeat(24), now: new Date('2026-11-20T11:59:00Z') });
    const previousReference = { provider: 'local' as const, key: `${'a'.repeat(24)}/${query.thirdPartyId}/${current.vehicleId}/${current.id}/imagen.jpg`,
      contentType: 'image/jpeg' as const, size: 3, width: 1, height: 1, sha256: 'd'.repeat(64) };
    repo.find.mockResolvedValueOnce(current as never); repo.readImageReference.mockResolvedValueOnce(previousReference);
    const deps = dependencies(['THIRD_PARTY_ADMIN']);
    const image = { data: Buffer.from('new image'), contentType: 'image/png' as const, size: 9, width: 1, height: 1, sha256: 'c'.repeat(64) };
    const updated = await createInvoices(deps).edit(actor, { id: current.id, thirdPartyId: query.thirdPartyId, expectedVersion: current.version,
      changes: { image } });
    expect(imageStorage.prepare).toHaveBeenCalledWith(expect.objectContaining({ previousReference, image: expect.objectContaining(image), invoiceId: current.id }));
    expect(repo.edit).toHaveBeenCalledWith(expect.objectContaining({ image: { id: expect.any(String), reference: expect.objectContaining({ contentType: 'image/png' }) } }));
    expect(imageStorage.finalize).toHaveBeenCalledTimes(1); expect(imageStorage.remove).not.toHaveBeenCalled();
    expect(updated.imageId).not.toBe(current.imageId);
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

  it('returns QR_IMMUTABLE to a driver before reading edit policy or changing its image', async () => {
    const qr = { ...createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-11-20', invoiceTime: '11:59:00', invoiceNumber: 'QR-1', issuerNit: '0001',
      buyerDocument: '123', amount: '10', vatAmount: '0', otherTaxesAmount: '0', totalAmount: '10', now: new Date('2026-11-20T11:59:00Z') }),
      origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64) } };
    repo.find.mockResolvedValueOnce(qr as never);
    const deps = dependencies(['DRIVER']); const invoices = createInvoices(deps);
    await expect(invoices.edit(actor, { id: qr.id, thirdPartyId: query.thirdPartyId, expectedVersion: qr.version, changes: { image: { data: Buffer.from([1]),
      contentType: 'image/jpeg', size: 1, width: 1, height: 1, sha256: 'a'.repeat(64) } } })).rejects.toMatchObject({ code: 'QR_IMMUTABLE' });
    expect(deps.editPolicy.read).not.toHaveBeenCalled(); expect(repo.edit).not.toHaveBeenCalled();
  });

  it('allows a third-party administrator to edit a QR invoice without the edit-window policy', async () => {
    const qr = { ...createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-05-06', invoiceTime: '05:23:51', invoiceNumber: 'QR-1', issuerNit: '0001',
      buyerDocument: '123', amount: '21571.00', vatAmount: '4098.49', otherTaxesAmount: '0.00', totalAmount: '25669.49', now: new Date('2026-11-20T11:59:00Z') }),
      amounts: { amount: '21571.00', vatAmount: '4098.49', otherTaxesAmount: '0.00', totalAmount: '25670.00' },
      origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64), cufe: 'b'.repeat(96) } };
    repo.find.mockResolvedValueOnce(qr as never); repo.edit.mockClear();
    const deps = dependencies(['THIRD_PARTY_ADMIN']);
    const result = await createInvoices(deps).edit(actor, { id: qr.id, thirdPartyId: query.thirdPartyId, expectedVersion: qr.version,
      changes: { invoiceNumber: 'QR-1-CORREGIDA' } });
    expect(result).toMatchObject({ origin: 'QR', invoiceNumber: 'QR-1-CORREGIDA', qrMetadata: qr.qrMetadata,
      amounts: { totalAmount: '25670.00' } });
    expect(repo.edit).toHaveBeenCalledWith(expect.objectContaining({ next: expect.objectContaining({ origin: 'QR', invoiceNumber: 'QR-1-CORREGIDA' }),
      authority: expect.objectContaining({ roles: expect.arrayContaining(['THIRD_PARTY_ADMIN']) }) }));
    expect(repo.edit.mock.calls[0][0]).not.toHaveProperty('editPolicy');
    expect(deps.editPolicy.read).not.toHaveBeenCalled();
  });

  it('does not show an edit-window warning to a third-party administrator viewing a QR invoice', async () => {
    const qr = { ...createInvoice({ id: 'f'.repeat(24), ownerSubject: actor.subject, thirdPartyId: query.thirdPartyId, assignmentId: 'c'.repeat(24),
      driverId: 'd'.repeat(24), vehicleId: 'e'.repeat(24), invoiceDate: '2026-05-06', invoiceTime: '05:23:51', invoiceNumber: 'QR-1', issuerNit: '0001',
      buyerDocument: '123', amount: '21571.00', vatAmount: '4098.49', otherTaxesAmount: '0.00', totalAmount: '25669.49', now: new Date('2026-11-20T11:59:00Z') }),
      amounts: { amount: '21571.00', vatAmount: '4098.49', otherTaxesAmount: '0.00', totalAmount: '25670.00' },
      origin: 'QR' as const, qrMetadata: { parserVersion: 'invoice-key-value-v1' as const, contentHash: 'a'.repeat(64) } };
    repo.find.mockResolvedValueOnce(qr as never);
    const deps = dependencies(['THIRD_PARTY_ADMIN']);
    await expect(createInvoices(deps).detail(actor, { id: qr.id, thirdPartyId: query.thirdPartyId }))
      .resolves.toMatchObject({ editability: { available: true, reason: null } });
    expect(deps.editPolicy.read).not.toHaveBeenCalled();
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
    expect(repo.create.mock.calls[2][0].image).toMatchObject({ reference: { sha256: attachment.sha256, contentType: attachment.contentType } });
  });

  it('computes a normalized SHA-256 fingerprint outside the pure QR parser', async () => {
    const deps = dependencies(['DRIVER']);
    const invoices = createInvoices(deps);
    const content = 'NumFac=F-1\r\nFecFac=2026-11-20\r\nHorFac=12:30:00\r\nNitFac=000123\r\nDocAdq=001234\r\nValFac=100.00\r\nValIva=19\r\nValOtroIm=0\r\nValTolFac=119.00';
    const preview = await invoices.previewQr(actor, { thirdPartyId: query.thirdPartyId, qrContent: content });
    expect(preview.metadata.contentHash).toBe('a'.repeat(64));
  });
});
