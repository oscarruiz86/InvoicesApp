import type { AvailableContexts, ContextSelection, ResolvedContext } from '../domain/context';
export type ResolutionReason = 'INITIAL' | 'SWITCH' | 'RESTORE';
export interface ContextApi {
  available(signal?: AbortSignal): Promise<AvailableContexts>;
  resolve(selection: ContextSelection, reason: ResolutionReason, signal?: AbortSignal): Promise<ResolvedContext>;
}
export interface ContextPreference {
  read(subject: string): ContextSelection | null;
  write(subject: string, selection: ContextSelection): boolean;
  clear(): void;
}
export interface SessionCleanupChannel { publish(): void; subscribe(listener: () => void): () => void; dispose(): void }
export const createContextUseCases = (api: ContextApi) => ({
  available: (signal?: AbortSignal) => api.available(signal),
  resolve: (selection: ContextSelection, reason: ResolutionReason, signal?: AbortSignal) => api.resolve(selection, reason, signal),
});
