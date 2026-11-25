import { offlineSubmissionResolutionEndpoint } from '@/bootstrap/invoice-sync-endpoint';
type Context = { readonly params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) { return offlineSubmissionResolutionEndpoint((await context.params).id)(request); }
