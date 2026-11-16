import type { AuthorizationPolicy } from '../domain/permissions';
export interface PolicyConfirmation {
  read(): Promise<AuthorizationPolicy>;
  confirm(expectedVersion: string): Promise<void>;
}
