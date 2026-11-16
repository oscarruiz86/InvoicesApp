import { membershipEndpoint } from '@/bootstrap/invitation-endpoint';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return membershipEndpoint('roles', id)(request);
}
