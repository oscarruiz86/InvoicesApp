/** Read-only Keycloak identity check, never a role assignment or local role authority. */
export interface AdministratorDirectory { isEnabledCompanyAdministrator(subject: string): Promise<boolean> }
