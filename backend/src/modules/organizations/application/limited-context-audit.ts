import type { ContextAudit } from './context-ports';

/** Successful resolutions are never sampled. A bounded per-process denial budget limits abuse. */
export function createLimitedContextAudit(target: ContextAudit, now: () => number): ContextAudit {
  let start = now(); let count = 0; let suppressed = 0;
  return { async record(event) {
    if (event.result === 'allowed') { await target.record(event); return; }
    if (now() - start >= 60_000) { start = now(); count = 0; }
    if (count >= 100) { suppressed++; return; }
    count++;
    const pending = suppressed; suppressed = 0;
    try { await target.record({ ...event, suppressed: pending }); } catch (error) { suppressed += pending + 1; throw error; }
  } };
}
