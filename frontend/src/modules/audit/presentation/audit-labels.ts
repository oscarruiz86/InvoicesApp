import type { AuditSource } from '../application/audit-history-api';

const actions: Readonly<Record<string, string>> = {
  ACCESS_DENIED:'Acceso denegado', POLICY_CHANGED:'Política de acceso modificada',
  COMPANY_CREATED:'Empresa creada', COMPANY_UPDATED:'Empresa actualizada', COMPANY_ACTIVATED:'Empresa activada', COMPANY_DEACTIVATED:'Empresa desactivada',
  COMPANY_ADMIN_ASSOCIATED:'Administrador de empresa asociado',
  THIRD_PARTY_CREATED:'Tercero creado', THIRD_PARTY_UPDATED:'Tercero actualizado', THIRD_PARTY_ACTIVATED:'Tercero activado', THIRD_PARTY_DEACTIVATED:'Tercero desactivado',
  RELATIONSHIP_ACTIVATED:'Relación activada', RELATIONSHIP_DEACTIVATED:'Relación desactivada',
  INVITATION_CREATED:'Invitación creada', INVITATION_RESENT:'Invitación reenviada', INVITATION_ACCEPTED:'Invitación aceptada', INVITATION_REJECTED:'Invitación rechazada',
  INVITATION_CANCELLED:'Invitación cancelada', INVITATION_EXPIRED:'Invitación vencida', INVITATION_DELIVERY_UNKNOWN:'Entrega de invitación sin confirmar',
  INVITATION_DELIVERY_LOGGED:'Entrega de invitación registrada', INVITATION_DELIVERY_FAILED:'Error al entregar la invitación', MEMBERSHIP_UPDATED:'Membresía actualizada',
  CONTEXT_SELECTED:'Contexto seleccionado', CONTEXT_SWITCH_REQUESTED:'Cambio de contexto solicitado', CONTEXT_RESTORED:'Contexto restaurado',
  CONTEXT_DENIED:'Cambio de contexto denegado', CONTEXT_INVALIDATED:'Contexto invalidado',
  DRIVER_PROVISIONED:'Conductor registrado', DRIVER_MIGRATED:'Conductor migrado', DRIVER_DEACTIVATED:'Conductor desactivado', DRIVER_ACTIVATED:'Conductor activado',
  VEHICLE_CREATED:'Vehículo creado', VEHICLE_UPDATED:'Vehículo actualizado', VEHICLE_ACTIVATED:'Vehículo activado', VEHICLE_DEACTIVATED:'Vehículo desactivado',
  ASSIGNMENT_CREATED:'Asignación creada', ASSIGNMENT_CLOSED:'Asignación cerrada', INVOICE_CREATED:'Factura creada', INVOICE_UPDATED:'Factura actualizada',
  SUBMISSION_LINKED_DUPLICATE:'Envío vinculado a un duplicado', SUBMISSION_CLOSED_ASSIGNMENT_APPROVED:'Envío aprobado al cerrar asignación', SUBMISSION_REJECTED:'Envío rechazado',
  PARAMETER_INITIALIZED:'Parámetro inicializado', PARAMETER_UPDATED:'Parámetro actualizado', CATALOG_ENTRY_CREATED:'Elemento de catálogo creado',
  CATALOG_ENTRY_UPDATED:'Elemento de catálogo actualizado', CATALOG_ENTRY_REACTIVATED:'Elemento de catálogo reactivado', CATALOG_ENTRY_DEACTIVATED:'Elemento de catálogo desactivado',
  AUDIT_HISTORY_READ:'Historial de auditoría consultado',
};

const operations: Readonly<Record<string, string>> = { CREATE:'creó', UPDATE:'actualizó', DELETE:'eliminó', ACTION:'ejecutó una acción en', ACTION_TOKEN:'generó un token para', REMOVE:'retiró', SET_PASSWORD:'cambió la contraseña de', RESET_PASSWORD:'restableció la contraseña de', IMPERSONATE:'suplantó a' };
const resources: Readonly<Record<string, string>> = { USER:'un usuario', REALM:'un realm', CLIENT:'un cliente', CLIENT_SCOPE:'un alcance de cliente', ROLE:'un rol', GROUP:'un grupo', IDENTITY_PROVIDER:'un proveedor de identidad', USER_FEDERATION:'una federación de usuarios', AUTHENTICATOR:'un autenticador', COMPONENT:'un componente', PROTOCOL_MAPPER:'un mapeador de protocolo', AUTHORIZATION:'una autorización', SCOPE:'un alcance' };

export function auditActionLabel(action: string, source?: AuditSource): string {
  if (source === 'keycloak-admin') {
    for (const operation of Object.keys(operations).sort((left,right)=>right.length-left.length)) {
      const prefix = `KEYCLOAK_ADMIN_${operation}_`;
      const resource = action.startsWith(prefix) ? action.slice(prefix.length) : '';
      if (resource && resources[resource]) return `Administración de Keycloak: ${operations[operation]} ${resources[resource]}`;
    }
  }
  return actions[action] ?? action.toLocaleLowerCase('es-CO').split(/[_:]+/u).filter(Boolean).join(' ');
}
