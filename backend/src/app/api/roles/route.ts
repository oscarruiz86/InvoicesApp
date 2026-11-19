import { readRolePolicyEndpoint, replaceRolePolicyEndpoint } from '@/bootstrap/role-policy-endpoint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = readRolePolicyEndpoint;
export const PUT = replaceRolePolicyEndpoint;
