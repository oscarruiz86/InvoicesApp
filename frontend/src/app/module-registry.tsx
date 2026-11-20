import { Alert, Stack, Typography } from '@mui/material';
import type { Permission } from '@/modules/authentication/domain/permissions';

export type ModuleContextRequirement = 'active' | 'organization';
export interface MarkerModuleDefinition {
  readonly key: string; readonly path: string; readonly label: string; readonly permission: Permission;
  readonly context: ModuleContextRequirement; readonly description: string;
}

/** Marker registrations keep menu and route metadata together until each domain module is implemented. */
export const markerModules = [
  { key: 'drivers', path: '/drivers', label: 'Conductores', permission: 'drivers:read', context: 'organization', description: 'Lista, detalle de identidad de solo lectura y estado de conductores.' },
  { key: 'vehicles', path: '/vehicles', label: 'Vehículos', permission: 'vehicles:read', context: 'organization', description: 'Lista, edición y estado de vehículos.' },
  { key: 'notification-deliveries', path: '/notification-deliveries', label: 'Entregas de notificaciones', permission: 'notifications:deliveries:read', context: 'active', description: 'Consulta el estado de entrega de notificaciones sin exponer contenido ni credenciales.' },
  { key: 'assignments', path: '/assignments', label: 'Asignaciones', permission: 'assignments:read', context: 'organization', description: 'Administración del historial de asignaciones de vehículos y conductores.' },
  { key: 'invoices', path: '/invoices', label: 'Facturas', permission: 'invoices:read', context: 'organization', description: 'Punto de integración para la administración de facturas.' },
  { key: 'parameters', path: '/parameters', label: 'Parámetros', permission: 'parameters:read', context: 'active', description: 'Punto de integración para la configuración de parámetros.' },
  { key: 'audit', path: '/audit', label: 'Auditoría', permission: 'audit:read', context: 'active', description: 'Punto de integración para la consulta de auditoría.' },
] as const satisfies readonly MarkerModuleDefinition[];

export function MarkerModulePage({ module }: { readonly module: MarkerModuleDefinition }) {
  const integrationPending = module.key === 'vehicles' || module.key === 'notification-deliveries';
  return <Stack spacing={1.5}>
    <Typography component="h1" variant="h4">{module.label}</Typography>
    <Alert severity="info">{module.description} {integrationPending ? 'La interfaz frontend está preparada; falta conectar el servicio del módulo.' : 'Este módulo aún no incluye operaciones.'}</Alert>
  </Stack>;
}
