import { thirdPartyEndpoint } from '@/bootstrap/third-party-endpoint';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return thirdPartyEndpoint('get', (await context.params).id)(request); }
export async function PATCH(request: Request, context: Context) { return thirdPartyEndpoint('update', (await context.params).id)(request); }
