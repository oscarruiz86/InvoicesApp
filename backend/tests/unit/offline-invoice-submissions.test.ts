import { describe, expect, it, vi } from 'vitest';
import { createInvoiceSubmission, transitionInvoiceSubmission, type InvoiceSubmission } from '@/modules/invoice-sync/domain/submission';
import { createOfflineInvoiceSubmissions, OfflineSubmissionError } from '@/modules/invoice-sync/application/submissions';
import type { createMongoInvoiceSubmissionRepository } from '@/modules/invoice-sync/infrastructure/mongodb/submission-repository';
import type { createInvoices } from '@/modules/invoices/application/invoices';
import type { createSubmissionImageStorage } from '@/modules/invoice-sync/infrastructure/submission-image-storage';
import type { createMongoInvoiceSyncFactsReader } from '@/modules/invoice-sync/infrastructure/mongodb/sync-facts';
import type { InvoiceAuthorizationPort, InvoiceImageInput } from '@/modules/invoices/application/invoice-ports';

const id = (digit: string) => digit.repeat(24);
const actor = { subject: 'driver-subject', username: null, name: null, email: null, roles: ['DRIVER'] as const, permissions: [] };
const admin = { subject: 'admin-subject', username: null, name: null, email: null, roles: ['THIRD_PARTY_ADMIN'] as const, permissions: [] };
const now = new Date('2026-11-23T12:00:00Z');
const reference = { provider: 'local' as const, key: `${id('f')}/${id('b')}/${id('d')}/${id('a')}/imagen.jpg`, contentType: 'image/jpeg' as const,
  size: 12, width: 2, height: 2, sha256: '9'.repeat(64) };
const image: InvoiceImageInput = { data: Buffer.from('image bytes'), contentType: 'image/jpeg', size: 12, width: 2, height: 2, sha256: '9'.repeat(64) };
const payload = { invoiceDate: '2026-11-20', invoiceTime: '11:30:00', invoiceNumber: 'F-1', issuerNit: '900111222', buyerDocument: '900333444',
  amount: '100', vatAmount: '19', otherTaxesAmount: '0', totalAmount: '119' };
const facts = { assignmentId: id('c'), thirdPartyId: id('b'), vehicleId: id('d'), driverId: id('e'), subject: actor.subject,
  assignmentVersion: 1, vehicleVersion: 1, driverVersion: 1, vehiclePlate: 'ABC123', assignmentStartedAt: new Date('2026-11-01T00:00:00Z'),
  assignmentEndedAt: new Date('2026-11-22T00:00:00Z') };
function submission(status: InvoiceSubmission['status'] = 'PENDING', causes: readonly ('BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE' | 'ASSIGNMENT_CLOSED')[] = ['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE', 'ASSIGNMENT_CLOSED']) {
  const value = createInvoiceSubmission({ id: id('a'), ownerSubject: actor.subject, thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'),
    vehicleId: id('d'), idempotencyKey: 'offline-key-1', requestHash: '8'.repeat(64), payload, imageReference: reference, now });
  return status === 'PENDING' ? value : transitionInvoiceSubmission({ current: value, expectedVersion: 1, status,
    causes: status === 'CONFLICT' ? causes : undefined, candidateInvoiceIds: status === 'CONFLICT' && causes.some(cause => cause !== 'ASSIGNMENT_CLOSED') ? [id('9')] : undefined, now });
}

function setup(input: { readonly assignmentStatus?: 'ACTIVE' | 'CLOSED' | 'MISSING'; readonly duplicateCauses?: readonly ('BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE' | 'ASSIGNMENT_CLOSED')[];
  readonly roles?: readonly string[]; readonly existing?: InvoiceSubmission; readonly createError?: Error }) {
  let current = input.existing ?? null;
  const auth = { authorize: vi.fn(async () => ({ roles: input.roles ?? ['DRIVER'], policyVersion: '1', contextRevision: '1' })) } as unknown as InvoiceAuthorizationPort;
  const repository = {
    findByIdentity: vi.fn(async () => current),
    find: vi.fn(async (input: { readonly id: string; readonly thirdPartyId: string; readonly ownerSubject?: string }) => current?.id === input.id
      && current.thirdPartyId === input.thirdPartyId && (!input.ownerSubject || current.ownerSubject === input.ownerSubject) ? current : null),
    create: vi.fn(async (value: Parameters<typeof createInvoiceSubmission>[0]) => current = createInvoiceSubmission({ ...value, imageReference: value.imageReference })),
    transition: vi.fn(async (value: Parameters<typeof transitionInvoiceSubmission>[0]) => current = transitionInvoiceSubmission(value)),
    listConflicts: vi.fn(async (value: { readonly page: number; readonly pageSize: number }) => ({ items: current?.status === 'CONFLICT' ? [current] : [], total: current?.status === 'CONFLICT' ? 1 : 0,
      page: value.page, pageSize: value.pageSize })),
    listOwned: vi.fn(async (value: { readonly page: number; readonly pageSize: number }) => ({ items: current ? [{ record: current, resolution: null }] : [], total: current ? 1 : 0,
      page: value.page, pageSize: value.pageSize })),
    listForThirdParty: vi.fn(async (value: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) => ({ items: current ? [{ record: current, resolution: null }] : [], total: current ? 1 : 0,
      page: value.page, pageSize: value.pageSize })),
    resolve: vi.fn(async (value: Parameters<ReturnType<typeof createMongoInvoiceSubmissionRepository>['resolve']>[0]) => current = transitionInvoiceSubmission({
      current: value.current, expectedVersion: value.expectedVersion, status: value.action === 'LINK_DUPLICATE' ? 'LINKED' : 'REJECTED', now: value.now,
      resolutionReason: value.reason, ...(value.resultInvoiceId ? { resultInvoiceId: value.resultInvoiceId } : {}) })),
  } as unknown as ReturnType<typeof createMongoInvoiceSubmissionRepository>;
  const createInvoice = vi.fn(async () => {
    if (input.createError) throw input.createError;
    if (input.assignmentStatus === 'CLOSED') throw Object.assign(new Error('ASSIGNMENT_NOT_ELIGIBLE'), { code: 'ASSIGNMENT_NOT_ELIGIBLE' });
    return { id: id('9') };
  });
  const commitSubmission = (offline: { readonly id: string; readonly expectedVersion: number }) => {
    if (!current || current.id !== offline.id || current.version !== offline.expectedVersion) throw new Error('INVOICE_VERSION_CONFLICT');
    current = transitionInvoiceSubmission({ current, expectedVersion: offline.expectedVersion, status: 'SYNCHRONIZED', resultInvoiceId: id('9'),
      resolutionReason: 'Validación online completada.', now });
  };
  const invoices = { normalizeImage: vi.fn(), previewQr: vi.fn(async () => { throw new Error('QR_INVALID'); }),
    create: createInvoice, createQr: vi.fn(async () => ({ id: id('9') })),
    createFromOfflineSubmission: vi.fn(async (_actor: typeof actor, _command: unknown, offline: { readonly id: string; readonly expectedVersion: number }) => { const result = await createInvoice(); commitSubmission(offline); return result; }),
    createQrFromOfflineSubmission: vi.fn(async (_actor: typeof actor, _command: unknown, offline: { readonly id: string; readonly expectedVersion: number }) => { const result = { id: id('9') }; commitSubmission(offline); return result; }),
    createOfflineException: vi.fn(async (_actor: typeof admin, _command: unknown, exception: { readonly expectedVersion: number; readonly reason: string }) => {
      if (!current || current.status !== 'CONFLICT') throw new Error('SUBMISSION_VERSION_CONFLICT');
      current = transitionInvoiceSubmission({ current, expectedVersion: exception.expectedVersion, status: 'SYNCHRONIZED', resultInvoiceId: id('9'),
        resolutionReason: exception.reason, now }); return { id: id('9') };
    }) } as unknown as ReturnType<typeof createInvoices>;
  const images = { stage: vi.fn(async () => reference), read: vi.fn(async () => image), remove: vi.fn(async () => {}) } as unknown as ReturnType<typeof createSubmissionImageStorage>;
  const syncFacts = { assignment: vi.fn(async () => input.assignmentStatus === 'MISSING' ? { status: 'MISSING' as const }
    : { status: input.assignmentStatus ?? 'ACTIVE', facts }),
    historyAssignments: vi.fn(async () => [{ assignmentId: id('c'), driverName: 'Ana conductora', vehiclePlate: 'ABC123' }]),
    duplicates: vi.fn(async () => ({ causes: input.duplicateCauses ?? [], candidates: [] })),
    candidates: vi.fn(async () => [{ id: id('9'), invoiceDate: '2026-11-20', invoiceNumber: 'F-1', issuerNit: '900111222', cause: 'BUSINESS_DUPLICATE' as const }]) } as unknown as ReturnType<typeof createMongoInvoiceSyncFactsReader>;
  const service = createOfflineInvoiceSubmissions({ repository, invoices, authorization: auth, images, facts: syncFacts,
    clock: { now: () => now }, ids: { next: () => id('a') } });
  return { service, repository, invoices, images, syncFacts, auth, current: () => current };
}

describe('offline invoice submission intake', () => {
  it('creates an eligible manual invoice through the normal idempotent invoice service', async () => {
    const setupValue = setup({});
    const result = await setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'offline-key-1' });
    expect(result).toMatchObject({ status: 'SYNCHRONIZED', resultInvoiceId: id('9') });
    expect(setupValue.invoices.createFromOfflineSubmission).toHaveBeenCalledWith(actor, expect.objectContaining({ ...payload, idempotencyKey: 'offline-key-1' }), { id: id('a'), expectedVersion: 1 });
  });

  it('requires correction for an invalid server-parsed QR and never validates it locally', async () => {
    const setupValue = setup({});
    const result = await setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'QR', assignmentId: id('c'), vehicleId: id('d'), payload: { qrContent: 'raw source' }, idempotencyKey: 'qr-key' });
    expect(result).toMatchObject({ status: 'REQUIRES_CORRECTION', resolutionReason: expect.stringContaining('QR') });
    expect(setupValue.invoices.previewQr).toHaveBeenCalledWith(actor, { thirdPartyId: id('b'), qrContent: 'raw source' });
    expect(setupValue.images.stage).not.toHaveBeenCalled();
  });

  it('explains which manual invoice fields and attachment need review after validation fails', async () => {
    const setupValue = setup({ createError: Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST' }) });
    const result = await setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'),
      payload, image, idempotencyKey: 'offline-key-1' });
    expect(result).toMatchObject({ status: 'REQUIRES_CORRECTION', resolutionReason: expect.stringContaining('fecha, hora (HH:mm:ss), número, NIT, documento, valores e imagen') });
    expect(result.resolutionReason).not.toMatch(/INVALID_REQUEST|InvoiceDomainError|stack/i);
  });

  it('retains simultaneous duplicate and closed-assignment causes after invoice creation rejects the closed assignment', async () => {
    const setupValue = setup({ assignmentStatus: 'CLOSED', duplicateCauses: ['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE'] });
    const result = await setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'offline-key-1' });
    expect(result).toMatchObject({ status: 'CONFLICT', causes: ['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE', 'ASSIGNMENT_CLOSED'] });
    expect(setupValue.invoices.createFromOfflineSubmission).toHaveBeenCalledOnce();
    expect(setupValue.invoices.create).toHaveBeenCalledOnce();
  });

  it('rejects missing assignments and actors without the DRIVER role', async () => {
    const missing = setup({ assignmentStatus: 'MISSING' });
    await expect(missing.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'missing' }))
      .resolves.toMatchObject({ status: 'REJECTED' });
    const admin = setup({ roles: ['THIRD_PARTY_ADMIN'] });
    await expect(admin.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'forbidden' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(admin.repository.create).not.toHaveBeenCalled();
  });

  it('uses the same invoice idempotency key after an uncertain response', async () => {
    const failed = Object.assign(new Error('temporary'), { code: 'AUTHORIZATION_UNAVAILABLE' });
    const setupValue = setup({ createError: failed });
    await expect(setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'offline-key-1' }))
      .rejects.toBeInstanceOf(OfflineSubmissionError);
    vi.mocked(setupValue.invoices.create).mockResolvedValueOnce({ id: id('9') } as never);
    const result = await setupValue.service.submit(actor, { thirdPartyId: id('b'), origin: 'MANUAL', assignmentId: id('c'), vehicleId: id('d'), payload, image, idempotencyKey: 'offline-key-1' });
    expect(result.status).toBe('SYNCHRONIZED');
    expect(vi.mocked(setupValue.invoices.createFromOfflineSubmission).mock.calls.map(call => call[1].idempotencyKey)).toEqual(['offline-key-1', 'offline-key-1']);
  });

  it('allows a DRIVER to read only an owned submission and denies other roles', async () => {
    const own = setup({ existing: submission() });
    await expect(own.service.own(actor, { id: id('a'), thirdPartyId: id('b') })).resolves.toMatchObject({ ownerSubject: actor.subject });
    const admin = setup({ existing: submission(), roles: ['THIRD_PARTY_ADMIN'] });
    await expect(admin.service.own(actor, { id: id('a'), thirdPartyId: id('b') })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(own.service.own(actor, { id: id('a'), thirdPartyId: id('f') })).resolves.toBeNull();
  });

  it('lists the driver history with invoice summary and administrator resolution without exposing internal owner data', async () => {
    const history = setup({ existing: submission('CONFLICT', ['BUSINESS_DUPLICATE']) });
    vi.mocked(history.repository.listOwned).mockResolvedValue({ items: [{ record: history.current()!, resolution: {
      action: 'LINK_DUPLICATE', at: now, reason: 'La factura ya estaba registrada.', resultInvoiceId: id('9'),
    } }], total: 1, page: 2, pageSize: 10 });

    const result = await history.service.ownHistory(actor, { thirdPartyId: id('b'), page: 2, pageSize: 10 });

    expect(history.repository.listOwned).toHaveBeenCalledWith({ ownerSubject: actor.subject, thirdPartyId: id('b'), page: 2, pageSize: 10 });
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10, items: [{ status: 'CONFLICT', invoiceNumber: 'F-1',
      totalAmount: '119', resolution: { action: 'LINK_DUPLICATE', reason: 'La factura ya estaba registrada.', resultInvoiceNumber: 'F-1' } }] });
    expect(result.items[0]).not.toHaveProperty('ownerSubject');
    expect(result.items[0]).not.toHaveProperty('resultInvoiceId');
    expect(history.syncFacts.historyAssignments).not.toHaveBeenCalled();
  });

  it('denies history access to a non-driver and does not query the repository', async () => {
    const adminSetup = setup({ roles: [], existing: submission() });
    await expect(adminSetup.service.ownHistory(actor, { thirdPartyId: id('b'), page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(adminSetup.repository.listOwned).not.toHaveBeenCalled();
    expect(adminSetup.repository.listForThirdParty).not.toHaveBeenCalled();
  });

  it('allows a third-party administrator to consult only the active third party history', async () => {
    const adminSetup = setup({ roles: ['THIRD_PARTY_ADMIN'], existing: submission('CONFLICT', ['BUSINESS_DUPLICATE']) });
    const result = await adminSetup.service.ownHistory(admin, { thirdPartyId: id('b'), page: 1, pageSize: 20 });

    expect(adminSetup.repository.listForThirdParty).toHaveBeenCalledWith({ thirdPartyId: id('b'), page: 1, pageSize: 20 });
    expect(adminSetup.repository.listOwned).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('ownerSubject');
    expect(result.items[0]).toMatchObject({ driverName: 'Ana conductora', vehiclePlate: 'ABC123' });
    expect(adminSetup.syncFacts.historyAssignments).toHaveBeenCalledWith({ thirdPartyId: id('b'), assignments: [{ subject: actor.subject, assignmentId: id('c'), vehicleId: id('d') }] });
  });

  it('restricts the conflict queue to authorized third-party administrators', async () => {
    const driver = setup({ existing: submission('CONFLICT') });
    await expect(driver.service.adminConflicts(actor, { thirdPartyId: id('b'), page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const adminSetup = setup({ existing: submission('CONFLICT'), roles: ['THIRD_PARTY_ADMIN'] });
    const page = await adminSetup.service.adminConflicts(admin, { thirdPartyId: id('b'), page: 1, pageSize: 20 });
    expect(page.items[0]).toMatchObject({ reviewFields: { invoiceNumber: 'F-1' }, candidates: [{ id: id('9') }] });
  });

  it('links a duplicate with an explicit reason and candidate id', async () => {
    const adminSetup = setup({ existing: submission('CONFLICT'), roles: ['THIRD_PARTY_ADMIN'] });
    const result = await adminSetup.service.resolveConflict(admin, { id: id('a'), thirdPartyId: id('b'), expectedVersion: 2, action: 'LINK_DUPLICATE',
      resultInvoiceId: id('9'), reason: 'La factura ya está registrada.' });
    expect(result).toMatchObject({ status: 'LINKED', resultInvoiceId: id('9'), resolutionReason: 'La factura ya está registrada.' });
    expect(adminSetup.repository.resolve).toHaveBeenCalledWith(expect.objectContaining({ actorSubject: admin.subject, action: 'LINK_DUPLICATE' }));
  });

  it('approves only a closed-assignment conflict with image and preserves the driver as owner', async () => {
    const adminSetup = setup({ existing: submission('CONFLICT', ['ASSIGNMENT_CLOSED']), assignmentStatus: 'CLOSED', roles: ['THIRD_PARTY_ADMIN'] });
    const result = await adminSetup.service.resolveConflict(admin, { id: id('a'), thirdPartyId: id('b'), expectedVersion: 2,
      action: 'APPROVE_CLOSED_ASSIGNMENT', reason: 'La imagen y el intervalo histórico fueron revisados.' });
    expect(result).toMatchObject({ status: 'SYNCHRONIZED', resultInvoiceId: id('9') });
    expect(adminSetup.invoices.createOfflineException).toHaveBeenCalledWith(admin, expect.objectContaining({ idempotencyKey: 'offline-key-1' }),
      expect.objectContaining({ ownerSubject: actor.subject, expectedVersion: 2, reason: 'La imagen y el intervalo histórico fueron revisados.' }));
  });
});
