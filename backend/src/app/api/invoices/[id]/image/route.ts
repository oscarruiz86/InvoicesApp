import { invoicesEndpoint } from '@/bootstrap/invoice-endpoint';
export const GET = (_request: Request, context: { readonly params: Promise<{ readonly id: string }> }) =>
  context.params.then(({ id }) => invoicesEndpoint('image', id)(_request));
