import { companyEndpoint } from '@/bootstrap/company-endpoint';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return companyEndpoint('status', (await context.params).id)(request); }
