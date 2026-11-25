import { invoicesEndpoint } from '@/bootstrap/invoice-endpoint';
export const GET = invoicesEndpoint('list');
export const POST = invoicesEndpoint('create');
