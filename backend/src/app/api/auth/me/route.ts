import { authenticatedEndpoint } from '@/bootstrap/authenticated-endpoint';
import { currentUserResponse } from '@/modules/identity/presentation/current-user';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = authenticatedEndpoint(currentUserResponse);
