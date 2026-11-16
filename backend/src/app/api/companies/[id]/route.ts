import { companyEndpoint } from '@/bootstrap/company-endpoint';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return companyEndpoint('get', (await context.params).id)(request); }
export async function PATCH(request: Request, context: Context) { return companyEndpoint('update', (await context.params).id)(request); }
