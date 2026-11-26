import type { AssignmentApi, AssignmentDto } from '@/modules/fleet/application/fleet-api';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvoiceApi } from './invoice-api';
import type { QrDecoderLoader } from './qr-decoder';
import type { OfflineCredentialPublicJwk, OfflineCredentialVerifier, OfflineInvoiceQueuePort } from './offline-invoice-ports';

export type OfflinePreparationState = 'idle' | 'preparing' | 'ready' | 'degraded' | 'expired';
export interface OfflinePreparationSnapshot {
  readonly state: OfflinePreparationState;
  readonly assignments: number;
  readonly expiresAt: string | null;
  readonly persistent: boolean | null;
  readonly reason: string | null;
  readonly pending: number;
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    return await navigator.storage.persist();
  } catch { return false; }
}

export interface OfflinePreparationDeps {
  readonly api: InvoiceApi;
  readonly assignments: AssignmentApi;
  readonly context: OfflinePreparationContext;
  readonly authorization: OfflinePreparationAuthorization;
  readonly queue: OfflineInvoiceQueuePort;
  readonly publicJwks: readonly OfflineCredentialPublicJwk[];
  readonly verifyCredential: OfflineCredentialVerifier;
  readonly loadQrDecoder: QrDecoderLoader;
}
export interface OfflinePreparationContext {
  getState(): { status: string; activeContext: { kind: string; organizationType?: string; organizationId?: string; authorization: { subject: string; scope: PermissionScope } } | null; };
  capture(): { scope: PermissionScope; signal: AbortSignal; isCurrent(): boolean; release(): void };
}
export interface OfflinePreparationAuthorization {
  getState(): { snapshot: { roles: readonly string[] } | null };
}

/** Prepares the driver's local capture context once per context generation. */
export function createOfflinePreparation(deps: OfflinePreparationDeps, onChange: (snapshot: OfflinePreparationSnapshot) => void) {
  let generation = 0;
  let controller: AbortController | undefined;
  let disposed = false;
  const publish = (snapshot: OfflinePreparationSnapshot) => { if (!disposed) onChange(snapshot); };
  async function prepare(): Promise<void> {
    const auth = deps.authorization.getState();
    const context = deps.context.getState();
    const subject = context.activeContext?.authorization.subject;
    const thirdPartyId = context.activeContext?.kind === 'ORGANIZATION' && context.activeContext.organizationType === 'THIRD_PARTY'
      ? context.activeContext.organizationId : null;
    const isDriver = Boolean(auth.snapshot?.roles.includes('DRIVER'));
    if (!isDriver || !subject || !thirdPartyId || !deps.publicJwks.length || context.status !== 'ready') {
      controller?.abort();
      publish({ state: 'idle', assignments: 0, expiresAt: null, persistent: null, reason: null, pending: 0 });
      return;
    }
    controller?.abort();
    const localGeneration = ++generation;
    const current = deps.context.capture();
    controller = new AbortController();
    const signal = AbortSignal.any([current.signal, controller.signal]);
    publish({ state: 'preparing', assignments: 0, expiresAt: null, persistent: null, reason: null, pending: 0 });
    try {
      const [persistent, page] = await Promise.all([
        requestPersistentStorage(),
        deps.assignments.listAssignments(current.scope, { page: 1, pageSize: 100, sort: 'startedAt', direction: 'desc', status: 'ACTIVE' }, signal),
      ]);
      if (signal.aborted || localGeneration !== generation || !current.isCurrent()) return;
      const active = page.items.filter(value => value.thirdPartyId === thirdPartyId && value.status === 'ACTIVE');
      if (!active.length || !navigator.onLine) throw new Error('NO_ACTIVE_ASSIGNMENTS');
      const issued = await deps.api.issueOfflineCredential(current.scope, active.map(value => ({ assignmentId: value.id, vehicleId: value.vehicleId })), signal);
      if (signal.aborted || localGeneration !== generation || !current.isCurrent()) return;
      const record = { id: `${subject}:${thirdPartyId}`, subject, thirdPartyId, credential: issued.credential, expiresAt: issued.expiresAt,
        assignmentIds: issued.assignmentIds, assignments: active.filter(value => issued.assignmentIds.includes(value.id)).map(toCachedAssignment), updatedAt: new Date().toISOString() };
      if (!await deps.verifyCredential(record, deps.publicJwks)) throw new Error('INVALID_OFFLINE_CREDENTIAL');
      await (await deps.loadQrDecoder()).preload?.();
      await deps.queue.saveCredential(record);
      const pending = (await deps.queue.list(subject, thirdPartyId)).filter(value => !['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(value.status)).length;
      publish({ state: 'ready', assignments: record.assignmentIds.length, expiresAt: record.expiresAt, persistent, reason: persistent === false ? 'STORAGE_NOT_PERSISTENT' : null, pending });
    } catch (error) {
      if (!signal.aborted && localGeneration === generation) publish({ state: 'degraded', assignments: 0, expiresAt: null, persistent: null, reason: error instanceof Error && error.message === 'NO_ACTIVE_ASSIGNMENTS' ? 'NO_ACTIVE_ASSIGNMENTS' : 'PREPARATION_FAILED', pending: 0 });
    } finally { current.release(); }
  }
  return { prepare, dispose() { disposed = true; controller?.abort(); } };
}

function toCachedAssignment(value: AssignmentDto) {
  return { ...value, status: 'ACTIVE' as const, endedAt: null };
}
