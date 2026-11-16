import type { AuthenticatedActor, ApplicationRole } from '../domain/actor';
import { AuthorizationError } from './authentication-error';

export function requireRoles(actor: AuthenticatedActor, required: readonly ApplicationRole[]): void {
  if (!required.every(role => actor.roles.includes(role))) throw new AuthorizationError();
}
