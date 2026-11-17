export interface NotificationWorkerHealthSnapshot {
  readonly ready: boolean;
  readonly stopping: boolean;
  readonly lastPollSuccess: number;
  readonly lastRetentionSuccess: number;
}

export function createNotificationWorkerHealth(now: () => number = Date.now, staleAfterMs = 180_000) {
  let stopping = false;
  let lastPollSuccess = 0;
  let lastRetentionSuccess = 0;
  const ready = () => !stopping && lastPollSuccess > 0 && now() - lastPollSuccess <= staleAfterMs;
  return {
    ready,
    markPollSuccess() { lastPollSuccess = now(); },
    markRetentionSuccess() { lastRetentionSuccess = now(); },
    beginShutdown() { stopping = true; },
    snapshot(): NotificationWorkerHealthSnapshot {
      return { ready: ready(), stopping, lastPollSuccess, lastRetentionSuccess };
    },
  };
}
