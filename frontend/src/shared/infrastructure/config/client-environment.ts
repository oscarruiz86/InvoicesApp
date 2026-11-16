import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';

const schema = z.object({ VITE_API_BASE_URL: z.string().trim().refine(value => {
  if (value === '/api') return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}).default('/api') });
export function readClientEnvironment(source: Record<string, unknown>) {
  const result = schema.safeParse(source);
  if (!result.success) throw new ApplicationError('CONFIGURATION');
  return { apiBaseUrl: result.data.VITE_API_BASE_URL.replace(/\/$/, '') };
}
