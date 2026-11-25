import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalInvoiceImageStorage, invoiceImageKey } from '@/modules/invoices/infrastructure/images/local-image-storage';

const id = 'a'.repeat(24);
const bytes = Buffer.from('valid test bytes');
const image = { data: bytes, contentType: 'image/png' as const, size: bytes.length, width: 1, height: 1,
  sha256: createHash('sha256').update(bytes).digest('hex') };
const roots: string[] = [];
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), 'invoice-images-')); roots.push(value); return value; }
afterEach(async () => { await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true }))); });

describe('local invoice image storage', () => {
  it('builds a canonical key from internal identifiers and content type', () => {
    expect(invoiceImageKey({ companyId: id, thirdPartyId: 'b'.repeat(24), vehicleId: 'c'.repeat(24), invoiceId: 'd'.repeat(24), contentType: 'image/jpeg' }))
      .toBe(`${id}/${'b'.repeat(24)}/${'c'.repeat(24)}/${'d'.repeat(24)}/imagen.jpg`);
  });
  it.each(['../secret', 'C:\\secret', 'a'.repeat(24) + '/../../secret'])('rejects unsafe key segments: %s', companyId => {
    expect(() => invoiceImageKey({ companyId, thirdPartyId: id, vehicleId: id, invoiceId: id, contentType: 'image/png' })).toThrow('INVALID_IMAGE_KEY');
  });
  it('prepares and verifies bytes, then commits to the private key', async () => {
    const storage = createLocalInvoiceImageStorage(await root());
    const prepared = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await expect(storage.read(prepared.reference)).rejects.toThrow();
    await storage.commit(prepared);
    await expect(storage.read(prepared.reference)).resolves.toEqual(bytes);
  });
  it('rejects a mismatched content hash before commit', async () => {
    const storage = createLocalInvoiceImageStorage(await root());
    await expect(storage.prepare({ image: { ...image, sha256: 'f'.repeat(64) }, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id }))
      .rejects.toThrow('IMAGE_STORAGE_UNAVAILABLE');
  });
  it('rejects altered bytes when reading a committed image', async () => {
    const storageRoot = await root(); const storage = createLocalInvoiceImageStorage(storageRoot);
    const prepared = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(prepared); await storage.finalize(prepared);
    await writeFile(path.join(storageRoot, ...prepared.reference.key.split('/')), 'altered');
    await expect(storage.read(prepared.reference)).rejects.toThrow('IMAGE_STORAGE_UNAVAILABLE');
  });
  it.skipIf(process.platform === 'win32')('rejects a symbolic link in a managed directory', async () => {
    const storageRoot = await root(); const outside = await root(); const company = path.join(storageRoot, id);
    await mkdir(company, { recursive: true }); await symlink(outside, path.join(company, 'b'.repeat(24)), 'dir');
    const storage = createLocalInvoiceImageStorage(storageRoot);
    await expect(storage.prepare({ image, companyId: id, thirdPartyId: 'b'.repeat(24), vehicleId: id, invoiceId: id }))
      .rejects.toThrow('IMAGE_STORAGE_UNAVAILABLE');
  });
  it('restores the previous image when a replacement is compensated', async () => {
    const storage = createLocalInvoiceImageStorage(await root());
    const first = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(first); await storage.finalize(first);
    const replacementBytes = Buffer.from('replacement');
    const replacement = await storage.prepare({ image: { ...image, data: replacementBytes, size: replacementBytes.length,
      sha256: createHash('sha256').update(replacementBytes).digest('hex') }, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(replacement);
    await expect(storage.read(replacement.reference)).resolves.toEqual(replacementBytes);
    await storage.compensate(replacement);
    await expect(storage.read(first.reference)).resolves.toEqual(bytes);
  });
  it('recovers an unreferenced prepared image from its journal', async () => {
    const storageRoot = await root(); const storage = createLocalInvoiceImageStorage(storageRoot);
    const prepared = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await createLocalInvoiceImageStorage(storageRoot).recover(async () => false);
    await expect(storage.read(prepared.reference)).rejects.toThrow();
  });
  it('preserves an existing identical image when recovery finds a replacement that was only prepared', async () => {
    const storageRoot = await root(); const storage = createLocalInvoiceImageStorage(storageRoot);
    const first = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(first); await storage.finalize(first);
    const candidate = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id, previousReference: first.reference });
    await expect(createLocalInvoiceImageStorage(storageRoot).recover(async () => false)).resolves.toBe(1);
    await expect(storage.read(first.reference)).resolves.toEqual(bytes);
    await expect(storage.read(candidate.reference)).resolves.toEqual(bytes);
  });
  it('restores a same-format image after recovery of an unreferenced committed replacement', async () => {
    const storageRoot = await root(); const storage = createLocalInvoiceImageStorage(storageRoot);
    const first = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(first); await storage.finalize(first);
    const replacementBytes = Buffer.from('replace before crash');
    const replacement = await storage.prepare({ image: { ...image, data: replacementBytes, size: replacementBytes.length,
      sha256: createHash('sha256').update(replacementBytes).digest('hex') }, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id,
      previousReference: first.reference });
    await storage.commit(replacement);
    await expect(createLocalInvoiceImageStorage(storageRoot).recover(async () => false)).resolves.toBe(1);
    await expect(storage.read(first.reference)).resolves.toEqual(bytes);
  });
  it('keeps the new extension and removes the old image after recovery of a committed replacement', async () => {
    const storageRoot = await root(); const storage = createLocalInvoiceImageStorage(storageRoot);
    const first = await storage.prepare({ image, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id });
    await storage.commit(first); await storage.finalize(first);
    const replacementBytes = Buffer.from('png replacement');
    const replacement = await storage.prepare({ image: { ...image, data: replacementBytes, contentType: 'image/png', size: replacementBytes.length,
      sha256: createHash('sha256').update(replacementBytes).digest('hex') }, companyId: id, thirdPartyId: id, vehicleId: id, invoiceId: id,
      previousReference: first.reference });
    await storage.commit(replacement);
    await expect(createLocalInvoiceImageStorage(storageRoot).recover(async reference => reference.key === replacement.reference.key)).resolves.toBe(1);
    await expect(storage.read(replacement.reference)).resolves.toEqual(replacementBytes);
    await expect(storage.read(first.reference)).rejects.toThrow();
  });
  it('rejects a relative storage root', () => {
    expect(() => createLocalInvoiceImageStorage('relative/path')).toThrow('INVALID_IMAGE_STORAGE_ROOT');
  });
});
