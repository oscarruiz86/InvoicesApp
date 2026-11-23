import { catalogListEndpoint } from '@/bootstrap/catalog-endpoint';
import { catalogCreateEntryEndpoint } from '@/bootstrap/catalog-endpoint';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ catalog: string }> };
export async function GET(request: Request, context: Context) { return catalogListEndpoint((await context.params).catalog)(request); }
export async function POST(request: Request, context: Context) { const { catalog } = await context.params; return catalogCreateEntryEndpoint(catalog)(request); }
