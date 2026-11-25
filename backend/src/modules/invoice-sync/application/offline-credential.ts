import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { InvoiceAuthorizationPort, InvoiceAssignmentConfirmationPort } from '@/modules/invoices/application/invoice-ports';

export interface OfflineCredentialAssignment { readonly assignmentId: string; readonly vehicleId: string }
export interface OfflineCredentialSigner {
  sign(input: { readonly subject: string; readonly thirdPartyId: string; readonly assignmentIds: readonly string[]; readonly now: Date; readonly ttlHours: number }): Promise<string>;
}
export class OfflineCredentialError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'FORBIDDEN' | 'CONFIGURATION_ERROR' | 'ASSIGNMENT_NOT_ELIGIBLE') { super(code); }
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

export function createOfflineCredentialIssuer(deps: {
  readonly authorization: InvoiceAuthorizationPort;
  readonly assignments: InvoiceAssignmentConfirmationPort;
  readonly signer: OfflineCredentialSigner;
  readonly clock: { now(): Date };
}) {
  return {
    async issue(actor: AuthenticatedActor, input: { readonly thirdPartyId: string; readonly assignments: readonly OfflineCredentialAssignment[]; readonly ttlHours: number }) {
      if (!validId(input.thirdPartyId) || !Array.isArray(input.assignments) || input.assignments.length < 1 || input.assignments.length > 100
        || !Number.isSafeInteger(input.ttlHours) || input.ttlHours < 1 || input.ttlHours > 8) throw new OfflineCredentialError('INVALID_REQUEST');
      const seen = new Set<string>();
      for (const assignment of input.assignments) {
        if (!validId(assignment.assignmentId) || !validId(assignment.vehicleId) || seen.has(assignment.assignmentId)) throw new OfflineCredentialError('INVALID_REQUEST');
        seen.add(assignment.assignmentId);
      }
      let receipt;
      try { receipt = await deps.authorization.authorize({ actor, thirdPartyId: input.thirdPartyId, permission: 'invoices:create' }); }
      catch { throw new OfflineCredentialError('FORBIDDEN'); }
      if (!receipt.roles.includes('DRIVER')) throw new OfflineCredentialError('FORBIDDEN');
      for (const assignment of input.assignments) {
        try {
          const facts = await deps.assignments.readOwnActive({ actorSubject: actor.subject, thirdPartyId: input.thirdPartyId,
            assignmentId: assignment.assignmentId, vehicleId: assignment.vehicleId });
          if (!facts || facts.subject !== actor.subject || facts.thirdPartyId !== input.thirdPartyId) throw new OfflineCredentialError('ASSIGNMENT_NOT_ELIGIBLE');
        } catch (error) {
          if (error instanceof OfflineCredentialError) throw error;
          throw new OfflineCredentialError('ASSIGNMENT_NOT_ELIGIBLE');
        }
      }
      const now = deps.clock.now();
      if (!Number.isFinite(now.getTime())) throw new OfflineCredentialError('CONFIGURATION_ERROR');
      try {
        return { credential: await deps.signer.sign({ subject: actor.subject, thirdPartyId: input.thirdPartyId,
          assignmentIds: [...seen], now, ttlHours: input.ttlHours }),
          expiresAt: new Date(Math.floor(now.getTime() / 1000) * 1000 + input.ttlHours * 3_600_000).toISOString(),
          subject: actor.subject, thirdPartyId: input.thirdPartyId, assignmentIds: [...seen] };
      } catch { throw new OfflineCredentialError('CONFIGURATION_ERROR'); }
    },
  };
}
