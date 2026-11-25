import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, rename, rm, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { InvoiceImageReference, InvoiceImageStoragePort, PreparedInvoiceImage } from '../../application/invoice-ports';

const validId = (value: string) => /^[a-f\d]{24}$/i.test(value);
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

export function invoiceImageKey(input: { companyId: string; thirdPartyId: string; vehicleId: string; invoiceId: string; contentType: string }): string {
  if (![input.companyId, input.thirdPartyId, input.vehicleId, input.invoiceId].every(validId)) throw new Error('INVALID_IMAGE_KEY');
  const extension = input.contentType === 'image/png' ? 'png' : input.contentType === 'image/jpeg' ? 'jpg' : null;
  if (!extension) throw new Error('INVALID_IMAGE_KEY');
  return `${input.companyId.toLowerCase()}/${input.thirdPartyId.toLowerCase()}/${input.vehicleId.toLowerCase()}/${input.invoiceId.toLowerCase()}/imagen.${extension}`;
}

export function createLocalInvoiceImageStorage(root: string): InvoiceImageStoragePort & { recover(isReferenced: (reference: InvoiceImageReference) => Promise<boolean>): Promise<number> } {
  if (!path.isAbsolute(root)) throw new Error('INVALID_IMAGE_STORAGE_ROOT');
  const absoluteRoot = path.resolve(root);
  const journalRoot = path.join(absoluteRoot, '.journal');
  const keyLocks = new Map<string, Promise<void>>();
  const operationReleases = new Map<string, () => void>();
  const operationPreviousReferences = new Map<string, InvoiceImageReference | undefined>();
  async function acquireKey(key: string) {
    const previous = keyLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    keyLocks.set(key, held);
    await previous;
    return () => { release(); if (keyLocks.get(key) === held) keyLocks.delete(key); };
  }
  function resolveKey(key: string) {
    if (!/^[a-f\d]{24}\/[a-f\d]{24}\/[a-f\d]{24}\/[a-f\d]{24}\/imagen\.(?:jpg|png)$/i.test(key)) throw new Error('INVALID_IMAGE_KEY');
    const target = path.resolve(absoluteRoot, ...key.split('/'));
    if (!target.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error('INVALID_IMAGE_KEY');
    return target;
  }
  async function ensureSafeParent(target: string) {
    await mkdir(absoluteRoot, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(absoluteRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
    const parent = path.dirname(target);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const relative = path.relative(absoluteRoot, parent).split(path.sep);
    let current = absoluteRoot;
    for (const segment of relative) {
      current = path.join(current, segment);
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
    }
  }
  async function ensureSafeJournalRoot() {
    await mkdir(journalRoot, { recursive: true, mode: 0o700 });
    const stat = await lstat(journalRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
  }
  async function journal(prepared: PreparedInvoiceImage, phase: 'prepared' | 'activating' | 'active', previousReference?: InvoiceImageReference, hadExisting?: boolean) {
    await ensureSafeJournalRoot();
    const record = JSON.stringify({ operationId: prepared.operationId, phase, reference: prepared.reference, previousReference, hadExisting });
    const temporary = path.join(journalRoot, `${prepared.operationId}.${randomUUID()}.tmp`);
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await handle.writeFile(record); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temporary, path.join(journalRoot, `${prepared.operationId}.json`)); }
    catch (error) { await rm(temporary, { force: true }); throw error; }
  }
  return {
    async prepare({ image, previousReference, ...ids }) {
      const key = invoiceImageKey({ ...ids, contentType: image.contentType });
      const releaseKey = await acquireKey(key);
      const target = resolveKey(key);
      const operationId = randomUUID(); const temporary = `${target}.${operationId}.tmp`;
      try {
        await ensureSafeParent(target);
        const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try { await handle.writeFile(image.data); await handle.sync(); } finally { await handle.close(); }
        const bytes = await readFile(temporary);
        if (bytes.length !== image.size || digest(bytes) !== image.sha256) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        const prepared = { reference: { provider: 'local' as const, key, contentType: image.contentType, size: image.size, width: image.width, height: image.height, sha256: image.sha256 }, operationId };
        await journal(prepared, 'prepared', previousReference);
        operationReleases.set(operationId, releaseKey);
        operationPreviousReferences.set(operationId, previousReference);
        return prepared;
      } catch (error) { await rm(temporary, { force: true }); releaseKey(); throw error; }
    },
    async read(reference) {
      const target = resolveKey(reference.key); await ensureSafeParent(target);
      const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== reference.size || stat.size > 5 * 1024 * 1024) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        const bytes = await handle.readFile();
        if (digest(bytes) !== reference.sha256) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        return bytes;
      } finally { await handle.close(); }
    },
    async commit(prepared) {
      const target = resolveKey(prepared.reference.key); const temporary = `${target}.${prepared.operationId}.tmp`;
      await ensureSafeParent(target);
      const backup = `${target}.${prepared.operationId}.bak`;
      const existing = await lstat(target).catch(() => null);
      if (existing && (existing.isSymbolicLink() || !existing.isFile())) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
      await journal(prepared, 'activating', operationPreviousReferences.get(prepared.operationId), Boolean(existing));
      if (existing) {
        await rename(target, backup);
      }
      try { await rename(temporary, target); }
      catch (error) { if (existing) await rename(backup, target); throw error; }
      await journal(prepared, 'active', operationPreviousReferences.get(prepared.operationId), Boolean(existing));
    },
    async compensate(prepared) {
      try {
        const target = resolveKey(prepared.reference.key);
        await rm(`${target}.${prepared.operationId}.tmp`, { force: true });
        const backup = `${target}.${prepared.operationId}.bak`;
        const backupStat = await lstat(backup).catch(() => null);
        if (backupStat?.isFile() && !backupStat.isSymbolicLink()) {
          await rm(target, { force: true }); await rename(backup, target);
        } else {
          const stat = await lstat(target).catch(() => null);
          const journalPath = path.join(journalRoot, `${prepared.operationId}.json`);
          const record = await readFile(journalPath, 'utf8').then(value => JSON.parse(value) as { phase?: string; hadExisting?: boolean })
            .catch((): { phase?: string; hadExisting?: boolean } => ({}));
          if (record.phase !== 'prepared' && !record.hadExisting && stat?.isFile() && !stat.isSymbolicLink()
            && digest(await readFile(target)) === prepared.reference.sha256) await rm(target, { force: true });
        }
        await rm(path.join(journalRoot, `${prepared.operationId}.json`), { force: true });
      } finally { operationReleases.get(prepared.operationId)?.(); operationReleases.delete(prepared.operationId); operationPreviousReferences.delete(prepared.operationId); }
    },
    async finalize(prepared) {
      try {
        const target = resolveKey(prepared.reference.key);
        const journalPath = path.join(journalRoot, `${prepared.operationId}.json`);
        const journalStat = await lstat(journalPath).catch(() => null);
        if (journalStat) {
          if (journalStat.isSymbolicLink() || !journalStat.isFile() || journalStat.size > 16 * 1024) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
          const record = JSON.parse(await readFile(journalPath, 'utf8')) as { previousReference?: InvoiceImageReference };
          if (record.previousReference && record.previousReference.key !== prepared.reference.key)
            await this.remove(record.previousReference);
        }
        await rm(`${target}.${prepared.operationId}.bak`, { force: true });
        await rm(journalPath, { force: true });
      } finally { operationReleases.get(prepared.operationId)?.(); operationReleases.delete(prepared.operationId); operationPreviousReferences.delete(prepared.operationId); }
    },
    async remove(reference) {
      const target = resolveKey(reference.key); await ensureSafeParent(target);
      const stat = await lstat(target).catch(() => null);
      if (!stat) return;
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
      await rm(target, { force: true });
    },
    async recover(isReferenced) {
        const rootStat = await lstat(absoluteRoot).catch(() => null);
        if (!rootStat) return 0;
        if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        await ensureSafeJournalRoot();
        const entries = await readdir(journalRoot).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; });
      let recovered = 0;
      for (const entry of entries.filter(value => /^[a-f\d-]{36}\.json$/i.test(value))) {
        const journalPath = path.join(journalRoot, entry);
        const journalStat = await lstat(journalPath);
        if (journalStat.isSymbolicLink() || !journalStat.isFile() || journalStat.size > 16 * 1024) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        const record = JSON.parse(await readFile(journalPath, 'utf8')) as { operationId: string; phase: string; reference: InvoiceImageReference; previousReference?: InvoiceImageReference; hadExisting?: boolean };
        if (!/^[a-f\d-]{36}$/i.test(record.operationId) || !['prepared', 'activating', 'active'].includes(record.phase)) throw new Error('IMAGE_STORAGE_UNAVAILABLE');
        resolveKey(record.reference.key);
        if (record.previousReference) resolveKey(record.previousReference.key);
        const prepared = { operationId: record.operationId, reference: record.reference };
        if (await isReferenced(record.reference)) {
          await this.finalize(prepared);
          if (record.previousReference && record.previousReference.key !== record.reference.key
            && !(await isReferenced(record.previousReference))) await this.remove(record.previousReference);
        } else await this.compensate(prepared);
        recovered++;
      }
      return recovered;
    },
  };
}
