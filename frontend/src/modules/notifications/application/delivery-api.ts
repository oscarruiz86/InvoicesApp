export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed';

/** Closed presentation DTO: only safe, already-masked delivery metadata can cross into UI state. */
export interface NotificationDeliveryDto {
  readonly id: string;
  readonly type: string;
  readonly channel: 'EMAIL';
  readonly createdAt: string;
  readonly status: NotificationDeliveryStatus;
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly recipientMasked: string;
  readonly resultCode: string | null;
  readonly providerReference: string | null;
}

const deliveryKeys = ['id', 'type', 'channel', 'createdAt', 'status', 'attempts', 'nextAttemptAt', 'recipientMasked', 'resultCode', 'providerReference'] as const;
type ParseResult = { readonly success: true; readonly data: NotificationDeliveryDto } | { readonly success: false; readonly error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function parseDelivery(value: unknown): NotificationDeliveryDto {
  if (!isRecord(value) || Object.keys(value).some(key => !deliveryKeys.includes(key as (typeof deliveryKeys)[number])) ||
    deliveryKeys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('Invalid notification delivery DTO.');
  }

  const masked = value.recipientMasked;
  if (!isBoundedString(value.id, 128) || !isBoundedString(value.type, 80) || value.channel !== 'EMAIL' ||
    !isIsoDate(value.createdAt) || !['pending', 'sent', 'failed'].includes(String(value.status)) ||
    typeof value.attempts !== 'number' || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 1000 ||
    !(value.nextAttemptAt === null || isIsoDate(value.nextAttemptAt)) ||
    !isBoundedString(masked, 254) || !/^[^@\s]{1,2}[*•…]+@[^@\s]+$/.test(masked) ||
    !(value.resultCode === null || isBoundedString(value.resultCode, 80, true)) ||
    !(value.providerReference === null || isBoundedString(value.providerReference, 128, true))) {
    throw new Error('Invalid notification delivery DTO.');
  }

  return {
    id: value.id,
    type: value.type,
    channel: 'EMAIL',
    createdAt: value.createdAt,
    status: value.status as NotificationDeliveryStatus,
    attempts: value.attempts,
    nextAttemptAt: value.nextAttemptAt,
    recipientMasked: masked,
    resultCode: value.resultCode,
    providerReference: value.providerReference,
  };
}

/** Minimal runtime schema API avoids bringing adapters or infrastructure libraries into application code. */
export const notificationDeliverySchema = {
  parse: parseDelivery,
  safeParse(value: unknown): ParseResult {
    try {
      return { success: true, data: parseDelivery(value) };
    } catch {
      return { success: false, error: new Error('Invalid notification delivery DTO.') };
    }
  },
};

export interface NotificationDeliveryQuery { readonly page: number; readonly pageSize: number; readonly status?: NotificationDeliveryStatus }
export interface NotificationDeliveryPageDto { readonly items: readonly NotificationDeliveryDto[]; readonly page: number; readonly pageSize: number; readonly total: number }
/** This read port can be bound only to a future authorized backend contract. */
export interface NotificationDeliveryReadPort { read(query: NotificationDeliveryQuery, signal?: AbortSignal): Promise<NotificationDeliveryPageDto> }
