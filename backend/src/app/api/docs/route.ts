import { technicalEndpoint } from '@/bootstrap/technical-endpoint';
import { documentationResponse } from '@/shared/presentation/http/documentation';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET() { return technicalEndpoint(documentationResponse); }
