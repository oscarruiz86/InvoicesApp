import { createReadStream } from 'node:fs';
import type { SecretReader } from '@/shared/application/secret-reader';

const MAX_SECRET_BYTES = 64 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

export const fileSecretReader: SecretReader = {
  async read(reference) {
    if (!reference || reference.includes('\0')) throw new Error('SECRET_UNAVAILABLE');
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of createReadStream(reference, { highWaterMark: MAX_SECRET_BYTES + 1 })) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += bytes.length;
        if (length > MAX_SECRET_BYTES) throw new Error();
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks, length);
      if (bytes.length === 0 || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || bytes.includes(0)) throw new Error();
      let value = decoder.decode(bytes);
      if (value.endsWith('\r\n')) value = value.slice(0, -2);
      else if (value.endsWith('\n')) value = value.slice(0, -1);
      if (!value) throw new Error();
      return value;
    } catch {
      throw new Error('SECRET_UNAVAILABLE');
    }
  },
};
