import { assignmentsEndpoint } from '@/bootstrap/assignment-endpoint';
export const GET = assignmentsEndpoint('list');
export const POST = assignmentsEndpoint('create');
