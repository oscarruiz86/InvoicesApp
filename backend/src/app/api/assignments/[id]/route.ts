import { assignmentsEndpoint } from '@/bootstrap/assignment-endpoint';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return assignmentsEndpoint('detail', (await context.params).id)(request);
}
