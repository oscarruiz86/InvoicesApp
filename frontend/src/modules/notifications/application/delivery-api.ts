export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed';
export type NotificationDeliveryType = 'INVITATION_CREATED' | 'INVITATION_RESENT';

/** Closed presentation DTO: sensitive worker fields cannot reach UI state. */
export interface NotificationDeliveryDto {
  readonly id: string;
  readonly type: NotificationDeliveryType;
  readonly channel: 'EMAIL';
  readonly createdAt: string;
  readonly status: NotificationDeliveryStatus;
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly recipientMasked: string;
  readonly resultCode: string | null;
}

export interface NotificationDeliveryQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: NotificationDeliveryStatus;
}

export interface NotificationDeliveryPageDto {
  readonly items: readonly NotificationDeliveryDto[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

const deliveryKeys = ['id', 'type', 'channel', 'createdAt', 'status', 'attempts', 'nextAttemptAt', 'recipientMasked', 'resultCode'] as const;
const pageKeys = ['items', 'page', 'pageSize', 'total'] as const;
type ParseResult<T> = { readonly success: true; readonly data: T } | { readonly success: false; readonly error: Error };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function parseDelivery(value: unknown): NotificationDeliveryDto {
  if (!isRecord(value) || !hasExactKeys(value, deliveryKeys)) throw new Error('Invalid notification delivery DTO.');
  if (!isBoundedString(value.id, 128) || !['INVITATION_CREATED', 'INVITATION_RESENT'].includes(String(value.type)) || value.channel !== 'EMAIL' ||
    !isIsoDate(value.createdAt) || !['pending', 'sent', 'failed'].includes(String(value.status)) ||
    typeof value.attempts !== 'number' || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 1000 ||
    !(value.nextAttemptAt === null || isIsoDate(value.nextAttemptAt)) ||
    !isBoundedString(value.recipientMasked, 254) || !/^[^@\s]{1,2}[*•…]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.recipientMasked) ||
    !(value.resultCode === null || (typeof value.resultCode === 'string' && /^[A-Z0-9_.-]{1,80}$/.test(value.resultCode)))) {
    throw new Error('Invalid notification delivery DTO.');
  }
  return {
    id: value.id,
    type: value.type as NotificationDeliveryType,
    channel: 'EMAIL',
    createdAt: value.createdAt,
    status: value.status as NotificationDeliveryStatus,
    attempts: value.attempts,
    nextAttemptAt: value.nextAttemptAt,
    recipientMasked: value.recipientMasked,
    resultCode: value.resultCode,
  };
}

function parsePage(value: unknown): NotificationDeliveryPageDto {
  if (!isRecord(value) || !hasExactKeys(value, pageKeys) || !Array.isArray(value.items) ||
    typeof value.page !== 'number' || !Number.isSafeInteger(value.page) || value.page < 1 ||
    typeof value.pageSize !== 'number' || !Number.isSafeInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 100 ||
    typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0 || value.items.length > value.pageSize) {
    throw new Error('Invalid notification delivery page.');
  }
  return { items: value.items.map(parseDelivery), page: value.page, pageSize: value.pageSize, total: value.total };
}

/** Runtime schemas keep the browser contract narrow without exposing infrastructure models. */
export const notificationDeliverySchema = {
  parse: parseDelivery,
  parsePage,
  safeParse(value: unknown): ParseResult<NotificationDeliveryDto> {
    try { return { success: true, data: parseDelivery(value) }; }
    catch { return { success: false, error: new Error('Invalid notification delivery DTO.') }; }
  },
  safeParsePage(value: unknown): ParseResult<NotificationDeliveryPageDto> {
    try { return { success: true, data: parsePage(value) }; }
    catch { return { success: false, error: new Error('Invalid notification delivery page.') }; }
  },
};

export interface NotificationDeliveryReadPort {
  list(query: NotificationDeliveryQuery, signal?: AbortSignal): Promise<NotificationDeliveryPageDto>;
  get(id: string, signal?: AbortSignal): Promise<NotificationDeliveryDto>;
}
