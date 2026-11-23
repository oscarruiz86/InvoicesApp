import { catalogLabelEndpoint } from '@/bootstrap/catalog-endpoint';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ catalog: string; code: string }> };
export async function PATCH(request: Request, context: Context) { const params = await context.params; return catalogLabelEndpoint(params.catalog, params.code)(request); }
