import { createStore } from 'zustand/vanilla';
import type { ReadHealth } from '../application/read-health';
import { ApplicationError, type ErrorCode } from '@/shared/application/application-error';

export interface HealthState {
  status: 'idle' | 'loading' | 'success' | 'error';
  errorCode?: ErrorCode;
  check(): Promise<void>;
  cancel(): void;
}
export function createHealthStore(readHealth: ReadHealth) {
  let active: AbortController | undefined;
  return createStore<HealthState>((set) => ({
    status: 'idle',
    async check() {
      active?.abort();
      const current = new AbortController(); active = current;
      set({ status: 'loading', errorCode: undefined });
      try { await readHealth(current.signal); if (active === current) set({ status: 'success' }); }
      catch (error) {
        if (active !== current) return;
        const code = error instanceof ApplicationError ? error.code : 'UNEXPECTED';
        set({ status: code === 'CANCELLED' ? 'idle' : 'error', errorCode: code });
      }
    },
    cancel() { active?.abort(); active = undefined; set({ status: 'idle', errorCode: undefined }); },
  }));
}
export type HealthStore = ReturnType<typeof createHealthStore>;
