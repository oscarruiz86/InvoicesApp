import { vehiclesEndpoint } from '@/bootstrap/vehicle-endpoint';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return vehiclesEndpoint('status', (await context.params).id)(request);
}
