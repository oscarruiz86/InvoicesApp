import type { EncryptedPayload, NotificationFailure, NotificationRecord } from '../domain/notification';
export interface NotificationRepository {
  claimDue(input: { owner: string; now: Date; leaseMs: number }): Promise<NotificationRecord | null>;
  claimProjection(owner: string, now: Date, leaseMs: number): Promise<NotificationRecord | null>;
  finishAttempt(input: { id: string; owner: string; now: Date; outcome: 'SENT' | 'FAILED' | 'SUPPRESSED' | 'RETRY'; failure: NotificationFailure | null; nextAttemptAt?: Date; serverReference?: string | null; project?: boolean }): Promise<void>;
  finishProjection(input: { id: string; owner: string; success: boolean; now: Date }): Promise<void>;
}
export interface PayloadCipher { prepare?(): Promise<void>; encrypt(value: unknown): Promise<EncryptedPayload>; decrypt<T>(value: EncryptedPayload): Promise<T> }
export interface PayloadKeyringConfiguration { readonly activeVersion: number; readonly keyFiles: Readonly<Record<number, string>> }
export interface MailMessage { readonly to: string; readonly fromAddress: string; readonly fromName: string; readonly subject: string; readonly text: string; readonly html?: string }
export interface MailTransport { send(message: MailMessage): Promise<{ readonly serverReference: string | null }> }
export interface InvitationDeliveryProjection { update(input: { invitationId: string; tokenVersion: number; attemptId: string; status: 'LOGGED' | 'FAILED'; now: Date }): Promise<void> }
export class NotificationConflict extends Error { constructor() { super('NOTIFICATION_IDEMPOTENCY_CONFLICT'); } }
export class NotificationConfigurationError extends Error { constructor() { super('NOTIFICATION_CONFIGURATION_INVALID'); } }
export class NotificationTemplateError extends Error { constructor() { super('NOTIFICATION_TEMPLATE_INVALID'); } }
export class NotificationTransportError extends Error { constructor(readonly failure: NotificationFailure) { super(`NOTIFICATION_${failure}`); } }
