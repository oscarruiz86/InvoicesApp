import { technicalEndpoint } from '@/bootstrap/technical-endpoint';
import { healthResponse } from '@/shared/presentation/http/health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET() { return technicalEndpoint(healthResponse); }
