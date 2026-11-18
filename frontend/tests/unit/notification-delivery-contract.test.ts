import { describe, expect, it } from 'vitest';
import { notificationDeliverySchema } from '@/modules/notifications/application/delivery-api';

const valid = { id: 'delivery-1', type: 'INVITATION_CREATED', channel: 'EMAIL', createdAt: '2026-11-18T12:00:00.000Z', status: 'pending', attempts: 1, nextAttemptAt: null, recipientMasked: 'a***@example.invalid', resultCode: null } as const;

describe('notification delivery presentation contract', () => {
  it('accepts only the safe, masked delivery fields', () => {
    expect(notificationDeliverySchema.parse(valid)).toEqual(valid);
  });
  it.each(['body', 'html', 'token', 'idempotencyKey', 'smtpSecret', 'credentials'])(
    'rejects sensitive field %s before presentation', field => {
      expect(notificationDeliverySchema.safeParse({ ...valid, [field]: 'must-not-render' }).success).toBe(false);
    },
  );
  it('rejects an unmasked recipient even when the DTO has no extra fields', () => {
    expect(notificationDeliverySchema.safeParse({ ...valid, recipientMasked: 'ana@example.invalid' }).success).toBe(false);
  });
});
