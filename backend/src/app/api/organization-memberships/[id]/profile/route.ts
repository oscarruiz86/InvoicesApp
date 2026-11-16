import { membershipEndpoint } from '@/bootstrap/invitation-endpoint';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return membershipEndpoint('profile', id)(request);
}
