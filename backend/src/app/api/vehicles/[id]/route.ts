import { vehiclesEndpoint } from '@/bootstrap/vehicle-endpoint';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return vehiclesEndpoint('detail', (await context.params).id)(request);
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return vehiclesEndpoint('update', (await context.params).id)(request);
}
