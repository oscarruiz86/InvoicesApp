import { invoicesEndpoint } from '@/bootstrap/invoice-endpoint';
export const GET = (_request: Request, context: { readonly params: Promise<{ readonly id: string }> }) =>
  context.params.then(({ id }) => invoicesEndpoint('detail', id)(_request));
export const PATCH = (_request: Request, context: { readonly params: Promise<{ readonly id: string }> }) =>
  context.params.then(({ id }) => invoicesEndpoint('edit', id)(_request));
