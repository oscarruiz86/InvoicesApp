import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { InvoiceImageError } from '../../application/invoice-image-error';
import type { InvoiceImageInput } from '../../application/invoice-ports';

export const MAX_INVOICE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_INVOICE_IMAGE_PIXELS = 40_000_000;
export async function normalizeInvoiceImage(input: { readonly data: Uint8Array; readonly claimedType: string }): Promise<InvoiceImageInput> {
  if (input.data.byteLength > MAX_INVOICE_IMAGE_BYTES) throw new InvoiceImageError('IMAGE_TOO_LARGE');
  if (input.claimedType !== 'image/jpeg' && input.claimedType !== 'image/png') throw new InvoiceImageError('IMAGE_TYPE_UNSUPPORTED');
  if (!input.data.byteLength) throw new InvoiceImageError('IMAGE_INVALID');
  try {
    const source = Buffer.from(input.data);
    const image = sharp(source, { failOn: 'error', limitInputPixels: MAX_INVOICE_IMAGE_PIXELS, animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== 'jpeg' && metadata.format !== 'png') throw new InvoiceImageError('IMAGE_TYPE_UNSUPPORTED');
    if (input.claimedType !== (metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png')) throw new InvoiceImageError('IMAGE_TYPE_UNSUPPORTED');
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INVOICE_IMAGE_PIXELS) throw new InvoiceImageError('IMAGE_DIMENSIONS_INVALID');
    // Re-encoding strips EXIF, GPS, comments and ancillary metadata while normalizing orientation.
    const output = metadata.format === 'jpeg' ? await image.rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer()
      : await image.rotate().png({ compressionLevel: 9 }).toBuffer();
    if (output.byteLength > MAX_INVOICE_IMAGE_BYTES) throw new InvoiceImageError('IMAGE_TOO_LARGE');
    return { data: output, contentType: metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png', size: output.byteLength,
      width: metadata.width, height: metadata.height, sha256: createHash('sha256').update(output).digest('hex') };
  } catch (error) {
    if (error instanceof InvoiceImageError) throw error;
    throw new InvoiceImageError('IMAGE_INVALID');
  }
}
