import { invitationEndpoint } from '@/bootstrap/invitation-endpoint';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return invitationEndpoint('resend', id)(request);
}
