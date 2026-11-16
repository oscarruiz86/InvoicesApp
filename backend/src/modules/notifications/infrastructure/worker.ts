import type { NotificationType } from '../domain/notification';
import type { InvitationDeliveryProjection, MailTransport, NotificationRepository, PayloadCipher } from '../application/ports';
import { NotificationConfigurationError, NotificationTemplateError, NotificationTransportError } from '../application/ports';
import { formatInvitationRoles, renderInvitationTemplate } from './templates';
import { createSmtpTransport, type SmtpConfiguration } from './smtp-transport';
export interface WorkerConfiguration { readonly enabled: boolean; readonly publicOrigin: string; readonly fromAddress: string; readonly fromName: string; readonly smtp: SmtpConfiguration | null }
const delays = [60_000, 300_000, 900_000, 3_600_000] as const;
export function createNotificationWorker(deps: { repository: NotificationRepository; cipher: PayloadCipher;
  configuration: WorkerConfiguration; projection: InvitationDeliveryProjection; isDeliverable(input: { invitationId: string; tokenVersion: number; attemptId: string }): Promise<boolean>; now(): Date; owner: string; transport?: MailTransport }) {
  async function projectOne() {
    const record = await deps.repository.claimProjection(deps.owner, deps.now(), 30_000); if (!record) return false;
    try { await deps.projection.update({ ...record.projectionData, status: record.projectionStatus ?? 'FAILED', now: deps.now() });
      await deps.repository.finishProjection({ id: record.id, owner: deps.owner, success: true, now: deps.now() }); }
    catch { await deps.repository.finishProjection({ id: record.id, owner: deps.owner, success: false, now: deps.now() }); return false; }
    return true;
  }
  async function processOne() {
    if (await projectOne()) return true;
    const record = await deps.repository.claimDue({ owner: deps.owner, now: deps.now(), leaseMs: 900_000 }); if (!record) return false;
    const now = deps.now();
    if (!await deps.isDeliverable(record.projectionData)) {
      await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now, outcome: 'SUPPRESSED', failure: null, project: false }); return true;
    }
    if (record.expiresAt.getTime() <= now.getTime()) {
      await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now, outcome: 'SUPPRESSED', failure: null, project: false }); return true;
    }
    if (record.recoveredLease && (record.previousAttempts ?? 0) >= 5) {
      await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now, outcome: 'FAILED', failure: 'INTERNAL' }); return true;
    }
    if (!deps.configuration.enabled) { await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now, outcome: 'SUPPRESSED', failure: null }); return true; }
    try {
      if (!deps.configuration.smtp || !record.payload) throw new NotificationConfigurationError();
      const payload = await deps.cipher.decrypt<{ token: string; organizationName: string; roles: readonly string[] }>(record.payload);
      const link = new URL('/invitations/accept', new URL(deps.configuration.publicOrigin)); link.hash = new URLSearchParams({ token: payload.token }).toString();
      const message = renderInvitationTemplate({ type: record.type as NotificationType, language: record.language, values: {
        organizationName: payload.organizationName, roles: formatInvitationRoles(payload.roles), expiresAt: record.expiresAt.toISOString(), link: link.toString(),
      } });
      const transport = deps.transport ?? createSmtpTransport(deps.configuration.smtp);
      const result = await transport.send({ to: record.recipient, fromAddress: deps.configuration.fromAddress, fromName: deps.configuration.fromName, ...message });
      await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now: deps.now(), outcome: 'SENT', failure: null, serverReference: result.serverReference });
    } catch (error) {
      const failure = error instanceof NotificationTransportError ? error.failure : error instanceof NotificationTemplateError ? 'TEMPLATE'
        : error instanceof NotificationConfigurationError ? 'CONFIGURATION' : 'INTERNAL';
      const retry = failure === 'SMTP_TEMPORARY' && record.attempts < 5;
      await deps.repository.finishAttempt({ id: record.id, owner: deps.owner, now: deps.now(), outcome: retry ? 'RETRY' : 'FAILED', failure,
        ...(retry ? { nextAttemptAt: new Date(now.getTime() + delays[record.attempts - 1]!) } : {}) });
    }
    return true;
  }
  return { processOne };
}
