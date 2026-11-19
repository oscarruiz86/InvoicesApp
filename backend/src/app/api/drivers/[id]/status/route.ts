import { driversEndpoint } from '@/bootstrap/driver-endpoint';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return driversEndpoint('status', (await context.params).id)(request);
}
