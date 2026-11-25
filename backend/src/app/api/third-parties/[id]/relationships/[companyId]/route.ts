import { thirdPartyEndpoint } from '@/bootstrap/third-party-endpoint';
type Context = { params: Promise<{ id: string; companyId: string }> };
export async function GET(request: Request, context: Context) {
  const params = await context.params;
  return thirdPartyEndpoint('relationship-get', params.id, params.companyId)(request);
}
export async function PUT(request: Request, context: Context) {
  const params = await context.params;
  return thirdPartyEndpoint('relationship', params.id, params.companyId)(request);
}
