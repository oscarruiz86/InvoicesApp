import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function secretFile(value: Uint8Array | string) {
  const directory = await mkdtemp(join(tmpdir(), 'invoice-secret-'));
  directories.push(directory);
  const path = join(directory, 'secret');
  await writeFile(path, value);
  return path;
}

it('preserves significant whitespace and removes only one final line ending', async () => {
  expect(await fileSecretReader.read(await secretFile('  secret  \r\n'))).toBe('  secret  ');
  expect(await fileSecretReader.read(await secretFile('secret\n\n'))).toBe('secret\n');
});
it.each([
  new Uint8Array(), new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), new Uint8Array([0x61, 0]), new Uint8Array([0xff]),
])('rejects invalid secret content without echoing it', async value => {
  await expect(fileSecretReader.read(await secretFile(value))).rejects.toThrow('SECRET_UNAVAILABLE');
});
it('rejects oversized secrets', async () => {
  await expect(fileSecretReader.read(await secretFile(new Uint8Array(64 * 1024 + 1)))).rejects.toThrow('SECRET_UNAVAILABLE');
});
it('does not expose paths when a mounted secret is absent', async () => {
  await expect(fileSecretReader.read(join(tmpdir(), 'not-mounted-secret'))).rejects.toThrow('SECRET_UNAVAILABLE');
});
