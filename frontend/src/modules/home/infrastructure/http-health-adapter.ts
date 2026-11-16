import { z } from 'zod';
import type { HealthPort } from '../application/read-health';
import { ApplicationError } from '@/shared/application/application-error';

const schema = z.object({ status: z.literal('ok') }).strict();
export function createHttpHealthAdapter(client: { get(path: string, signal?: AbortSignal): Promise<unknown> }): HealthPort {
  return { async read(signal) {
    const result = schema.safeParse(await client.get('health', signal));
    if (!result.success) throw new ApplicationError('INVALID_RESPONSE');
    return result.data;
  } };
}
