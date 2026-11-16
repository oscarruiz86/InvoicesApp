import type { AuthenticatedActor } from '../application/identity-verifier';
import { readCurrentUser } from '../application/read-current-user';

export function currentUserResponse(actor: AuthenticatedActor) {
  return Response.json(readCurrentUser(actor), { headers: { 'Cache-Control': 'no-store' } });
}
