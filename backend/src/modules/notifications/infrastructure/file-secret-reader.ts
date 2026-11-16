import { readFile } from 'node:fs/promises';
import type { SecretReader } from '../application/ports';
export const fileSecretReader: SecretReader = { async read(reference) { if (!reference || reference.includes('\0')) throw new Error('SECRET_REFERENCE_INVALID');
  try { return (await readFile(reference, 'utf8')).trim(); } catch { throw new Error('SECRET_UNAVAILABLE'); } } };
