export const roleLabels = {
  APP_ADMIN: 'Administrador de plataforma',
  COMPANY_ADMIN: 'Administrador de empresa',
  THIRD_PARTY_ADMIN: 'Administrador de tercero',
  DRIVER: 'Conductor',
} as const;

export type DisplayableRole = keyof typeof roleLabels;

export function getRoleLabel(role: string): string {
  return roleLabels[role as DisplayableRole] ?? 'Perfil asignado';
}