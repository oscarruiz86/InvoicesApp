export type NotificationType = 'INVITATION_CREATED' | 'INVITATION_RESENT';
export type NotificationChannel = 'email';
export type NotificationStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SUPPRESSED';
export type NotificationFailure = 'CONFIGURATION' | 'TEMPLATE' | 'INVALID_RECIPIENT' | 'SMTP_TEMPORARY' | 'SMTP_PERMANENT' | 'INTERNAL';
export interface EncryptedPayload { readonly ciphertext: string; readonly iv: string; readonly tag: string; readonly keyVersion: number }
export interface InvitationNotificationRequest {
  readonly id: string; readonly type: NotificationType; readonly channel: NotificationChannel; readonly recipient: string;
  readonly language: string; readonly functionalReference: string; readonly idempotencyKey: string; readonly expiresAt: Date;
  readonly payload: Readonly<{ token: string; organizationName: string; roles: readonly string[] }>;
  readonly projectionData: Readonly<{ invitationId: string; tokenVersion: number; attemptId: string }>;
  readonly createdAt: Date;
}
export interface NotificationRecord {
  readonly id: string; readonly type: NotificationType; readonly channel: NotificationChannel; readonly recipient: string;
  readonly language: string; readonly functionalReference: string; readonly idempotencyKey: string; readonly payload: EncryptedPayload | null;
  readonly expiresAt: Date; readonly createdAt: Date; readonly status: NotificationStatus; readonly attempts: number; readonly recoveredLease?: boolean; readonly previousAttempts?: number;
  readonly nextAttemptAt: Date; readonly leaseUntil: Date | null; readonly owner: string | null; readonly terminalFailure: NotificationFailure | null;
  readonly projectionPending: boolean; readonly projectionStatus: 'LOGGED' | 'FAILED' | null;
  readonly projectionData: Readonly<{ invitationId: string; tokenVersion: number; attemptId: string }>;
}
