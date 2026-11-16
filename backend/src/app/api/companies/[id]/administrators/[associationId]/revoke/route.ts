import { authenticatedEndpoint } from '@/bootstrap/authenticated-endpoint';
import { retiredCompanyAssociationResponse } from '@/modules/organizations/presentation/companies';
export const POST = authenticatedEndpoint(async () => retiredCompanyAssociationResponse());
