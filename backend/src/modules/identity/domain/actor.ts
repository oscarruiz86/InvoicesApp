export const applicationRoles = ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const;
export type ApplicationRole = typeof applicationRoles[number];

export interface AuthenticatedActor {
  readonly subject: string;
  readonly username: string | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly roles: readonly ApplicationRole[];
  readonly permissions: readonly string[];
}
