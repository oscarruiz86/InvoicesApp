import { driversEndpoint } from '@/bootstrap/driver-endpoint';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return driversEndpoint('detail', (await context.params).id)(request);
}
