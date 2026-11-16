import { technicalEndpoint } from '@/bootstrap/technical-endpoint';
import document from '../../../../openapi/openapi.json';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET() { return technicalEndpoint(() => Response.json(document)); }
