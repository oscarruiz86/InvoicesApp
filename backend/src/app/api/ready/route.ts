import { technicalEndpoint } from '@/bootstrap/technical-endpoint';
import { readinessEndpoint } from '@/bootstrap/readiness-endpoint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET() { return technicalEndpoint(readinessEndpoint); }
