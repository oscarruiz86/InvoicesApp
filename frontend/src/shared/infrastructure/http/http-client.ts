import { ApplicationError } from '@/shared/application/application-error';

export function createHttpClient(baseUrl: string, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), timeoutMs = 5000) {
  return {
    async get(path: string, signal?: AbortSignal): Promise<unknown> {
      if (signal?.aborted) throw new ApplicationError('CANCELLED');
      const controller = new AbortController();
      const cancel = () => controller.abort('CANCELLED');
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { if (!controller.signal.aborted) controller.abort('TIMEOUT'); }, timeoutMs);
      try {
        const response = await fetcher(`${baseUrl}/${path.replace(/^\//, '')}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new ApplicationError('HTTP');
        try { return await response.json(); }
        catch { throw new ApplicationError('INVALID_RESPONSE'); }
      } catch (error) {
        if (controller.signal.aborted) throw new ApplicationError(controller.signal.reason === 'TIMEOUT' ? 'TIMEOUT' : 'CANCELLED');
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError('NETWORK');
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    },
  };
}
