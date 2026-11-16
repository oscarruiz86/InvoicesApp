import type { ApplicationRole } from '../domain/actor';

export interface IdentityRoleReader {
  read(subject: string): Promise<readonly ApplicationRole[] | null>;
}
