import { authenticatedEndpoint } from '@/bootstrap/authenticated-endpoint';
import { companyEndpoint } from '@/bootstrap/company-endpoint';
import { retiredCompanyAssociationResponse } from '@/modules/organizations/presentation/companies';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return companyEndpoint('administrators', (await context.params).id)(request); }
export const POST = authenticatedEndpoint(async () => retiredCompanyAssociationResponse());
