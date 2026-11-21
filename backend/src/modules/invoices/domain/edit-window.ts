export interface InvoiceEditPolicy {
  readonly state: 'AVAILABLE';
  readonly revision: string;
  readonly scope: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly durationSeconds: number;
}

export type InvoiceEditWindowResult = 'OPEN' | 'CLOSED' | 'POLICY_UNAVAILABLE';

/** Evaluate the policy returned for this request; no duration is cached on the invoice. */
export function evaluateInvoiceEditWindow(input: {
  readonly createdAt: Date;
  readonly now: Date;
  readonly policy: InvoiceEditPolicy;
}): InvoiceEditWindowResult {
  const { createdAt, now, policy } = input;
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime()) || !(now instanceof Date) || !Number.isFinite(now.getTime())
    || !policy || typeof policy.revision !== 'string' || !policy.revision.trim() || typeof policy.scope !== 'string' || !policy.scope.trim()
    || !Number.isFinite(policy.durationSeconds) || policy.durationSeconds <= 0
    || !(policy.validFrom instanceof Date) || !Number.isFinite(policy.validFrom.getTime())
    || (policy.validUntil !== null && (!(policy.validUntil instanceof Date) || !Number.isFinite(policy.validUntil.getTime())))) return 'POLICY_UNAVAILABLE';
  if (now < policy.validFrom || (policy.validUntil && now >= policy.validUntil)) return 'POLICY_UNAVAILABLE';
  return now.getTime() < createdAt.getTime() + policy.durationSeconds * 1000 ? 'OPEN' : 'CLOSED';
}
