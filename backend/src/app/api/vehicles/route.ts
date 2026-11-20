import { vehiclesEndpoint } from '@/bootstrap/vehicle-endpoint';
export const GET = vehiclesEndpoint('list');
export const POST = vehiclesEndpoint('create');
