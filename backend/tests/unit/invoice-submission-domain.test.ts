import { describe, expect, it } from 'vitest';
import { createInvoiceSubmission, InvoiceSubmissionError, transitionInvoiceSubmission } from '@/modules/invoice-sync/domain/submission';

const id = (digit: string) => digit.repeat(24);
const base = { id: id('a'), ownerSubject: 'driver-1', thirdPartyId: id('b'), origin: 'MANUAL' as const, assignmentId: id('c'), vehicleId: id('d'),
  idempotencyKey: 'offline-1', requestHash: 'e'.repeat(64), payload: { invoiceNumber: 'A-1' }, now: new Date('2026-11-23T12:00:00Z') };

describe('invoice submission domain', () => {
  it('creates an immutable pending submission and requires original QR content', () => {
    expect(createInvoiceSubmission(base)).toMatchObject({ status: 'PENDING', version: 1, causes: [], resultInvoiceId: null });
    expect(() => createInvoiceSubmission({ ...base, origin: 'QR', payload: { invoiceNumber: 'A-1' } })).toThrow('INVALID_SUBMISSION');
    expect(createInvoiceSubmission({ ...base, origin: 'QR', payload: { qrContent: 'source QR text' } }).payload.qrContent).toBe('source QR text');
  });

  it('keeps all conflict causes and starts the 30 day resolution window', () => {
    const created = createInvoiceSubmission(base);
    const conflict = transitionInvoiceSubmission({ current: created, expectedVersion: 1, status: 'CONFLICT',
      causes: ['BUSINESS_DUPLICATE', 'ASSIGNMENT_CLOSED'], now: base.now });
    expect(conflict).toMatchObject({ status: 'CONFLICT', version: 2, causes: ['BUSINESS_DUPLICATE', 'ASSIGNMENT_CLOSED'] });
    expect(conflict.expiresAt?.getTime()).toBe(base.now.getTime() + 30 * 86_400_000);
  });

  it('retains the staged image while correction or conflict is open and retains a cleanup reference after resolution', () => {
    const created = createInvoiceSubmission({ ...base, imageReference: { provider: 'local', key: `${id('f')}/${id('b')}/${id('d')}/${id('a')}/imagen.jpg`,
      contentType: 'image/jpeg', size: 12, width: 2, height: 2, sha256: '9'.repeat(64) } });
    const correction = transitionInvoiceSubmission({ current: created, expectedVersion: 1, status: 'REQUIRES_CORRECTION', now: base.now, resolutionReason: 'Revisar imagen' });
    expect(correction.imageReference).toEqual(created.imageReference);
    expect(correction.expiresAt?.getTime()).toBe(base.now.getTime() + 30 * 86_400_000);
    const rejected = transitionInvoiceSubmission({ current: correction, expectedVersion: 2, status: 'REJECTED', now: base.now, resolutionReason: 'No procede' });
    expect(rejected.imageReference).toEqual(created.imageReference);
  });

  it('requires current version and prevents transitions out of terminal states', () => {
    const created = createInvoiceSubmission(base);
    const accepted = transitionInvoiceSubmission({ current: created, expectedVersion: 1, status: 'SYNCHRONIZED', resultInvoiceId: id('f'), resolutionReason: 'Registrada', now: base.now });
    expect(() => transitionInvoiceSubmission({ current: accepted, expectedVersion: 1, status: 'REJECTED', resolutionReason: 'x', now: base.now }))
      .toThrowError(InvoiceSubmissionError);
    expect(() => transitionInvoiceSubmission({ current: accepted, expectedVersion: 2, status: 'REJECTED', resolutionReason: 'x', now: base.now }))
      .toThrow('SUBMISSION_TRANSITION_INVALID');
  });

  it('requires a reason to reject a submission', () => {
    const created = createInvoiceSubmission(base);
    const conflict = transitionInvoiceSubmission({ current: created, expectedVersion: 1, status: 'CONFLICT', causes: ['ASSIGNMENT_CLOSED'], now: base.now });
    expect(() => transitionInvoiceSubmission({ current: conflict, expectedVersion: 2, status: 'REJECTED', now: base.now })).toThrow('INVALID_SUBMISSION');
  });
});
