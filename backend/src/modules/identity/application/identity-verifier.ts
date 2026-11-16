import type { AuthenticatedActor } from '../domain/actor';
export type { AuthenticatedActor } from '../domain/actor';
export interface IdentityVerifier {
  verify(accessToken: string): Promise<AuthenticatedActor>;
}
