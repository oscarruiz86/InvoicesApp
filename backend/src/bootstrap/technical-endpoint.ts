import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { errorResponse } from '@/shared/presentation/http/errors';

export async function technicalEndpoint(action: () => Response | Promise<Response>): Promise<Response> {
  try { readServerEnvironment(); return await action(); }
  catch (error) { return errorResponse(error); }
}
