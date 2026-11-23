import { catalogDeactivateEntryEndpoint } from '@/bootstrap/catalog-endpoint';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ catalog: string; code: string }> };
export async function POST(request: Request, context: Context) { const { catalog, code } = await context.params; return catalogDeactivateEntryEndpoint(catalog, code)(request); }
