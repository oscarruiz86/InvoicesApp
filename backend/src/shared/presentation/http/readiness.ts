const timeout = (milliseconds: number) => new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error('READINESS_TIMEOUT')), milliseconds).unref?.();
});

export function createReadinessHandler(checkDependencies: () => Promise<void>) {
  return async function readinessResponse(): Promise<Response> {
    try {
      await Promise.race([checkDependencies(), timeout(5000)]);
      return Response.json({ status: 'ready' }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ status: 'not_ready' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}

export { timeout as readinessTimeout };
