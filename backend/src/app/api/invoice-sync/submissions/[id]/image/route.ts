import { offlineSubmissionImageEndpoint } from '@/bootstrap/invoice-sync-endpoint';
type Context = { readonly params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return offlineSubmissionImageEndpoint((await context.params).id)(request); }
