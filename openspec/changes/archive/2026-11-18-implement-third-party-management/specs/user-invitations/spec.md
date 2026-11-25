# Spec Delta

## ADDED Requirements

### Requirement: Elegibilidad vigente del tercero remitente y destinatario

Las operaciones de invitación y membresía para un tercero MUST revalidar que el tercero esté activo y, cuando intervenga una empresa, que la relación empresa-tercero siga activa. La creación, reenvío, aceptación, rechazo, cambio de roles y reactivación MUST preservar el historial, pero MUST rechazar transiciones que creen o restauren acceso sobre un tercero o relación inactivos.

#### Scenario: Relación revocada antes de aceptar

- **WHEN** una invitación pendiente para un tercero se acepta después de que su relación con la empresa remitente fue desactivada
- **THEN** la aceptación se rechaza sin crear membresía ni acceso y la invitación conserva su historial

#### Scenario: Tercero reactivado con membresía suspendida

- **WHEN** se reactiva un tercero cuya asociación de usuario fue suspendida previamente
- **THEN** la asociación permanece suspendida hasta una reactivación autorizada y explícita

#### Scenario: Historial de una relación inactiva

- **WHEN** un administrador autorizado consulta invitaciones o membresías históricas de un tercero relacionado anteriormente
- **THEN** puede ver los registros permitidos sin obtener acciones que restauren acceso mientras la relación siga inactiva
