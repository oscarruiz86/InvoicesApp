import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeInvoiceImage, MAX_INVOICE_IMAGE_BYTES } from '@/modules/invoices/infrastructure/images/normalize-image';
import { InvoiceImageError } from '@/modules/invoices/application/invoice-image-error';

const png = () => sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();

describe('invoice image normalization', () => {
  it('decodes supported images, strips metadata through re-encoding and returns a digest', async () => {
    const source = await png();
    const image = await normalizeInvoiceImage({ data: source, claimedType: 'image/png' });
    expect(image).toMatchObject({ contentType: 'image/png', width: 1, height: 1 });
    expect(image.sha256).toMatch(/^[a-f\d]{64}$/);
    expect(image.data).not.toEqual(source);
  });
  it('rejects forged types, invalid content and excessive sizes before storage', async () => {
    const source = await png();
    await expect(normalizeInvoiceImage({ data: source, claimedType: 'image/jpeg' })).rejects.toMatchObject({ code: 'IMAGE_TYPE_UNSUPPORTED' });
    await expect(normalizeInvoiceImage({ data: Buffer.from('not an image'), claimedType: 'image/png' })).rejects.toMatchObject({ code: 'IMAGE_INVALID' });
    await expect(normalizeInvoiceImage({ data: new Uint8Array(MAX_INVOICE_IMAGE_BYTES + 1), claimedType: 'image/png' }))
      .rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  });
});
