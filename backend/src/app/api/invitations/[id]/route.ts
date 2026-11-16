import { invitationEndpoint } from '@/bootstrap/invitation-endpoint';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return invitationEndpoint('get', id)(_request);
}
