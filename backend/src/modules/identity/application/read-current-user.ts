import type { AuthenticatedActor } from '../domain/actor';

export function readCurrentUser(actor: AuthenticatedActor) {
  return { user: {
    id: actor.subject,
    username: actor.username,
    name: actor.name,
    email: actor.email,
    roles: [...actor.roles],
  } };
}
