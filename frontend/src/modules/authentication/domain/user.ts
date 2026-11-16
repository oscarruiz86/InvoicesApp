export const applicationRoles = ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const;
export type ApplicationRole = typeof applicationRoles[number];
export interface SessionUser {
  readonly id: string;
  readonly username: string | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly roles: readonly ApplicationRole[];
}
