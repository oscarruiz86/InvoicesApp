import { assignmentsEndpoint } from '@/bootstrap/assignment-endpoint';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return assignmentsEndpoint('close', (await context.params).id)(request);
}
