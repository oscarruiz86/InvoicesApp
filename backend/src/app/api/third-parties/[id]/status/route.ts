import { thirdPartyEndpoint } from '@/bootstrap/third-party-endpoint';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return thirdPartyEndpoint('status', (await context.params).id)(request); }
