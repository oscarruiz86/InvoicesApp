# Proposal

## Why

La aceptación de invitaciones ya puede conceder el rol local `DRIVER`, pero Invoices App no tiene un agregado operativo de conductor ni una API de Flota que lo represente. Esto deja sin un propietario verificable la activación, desactivación y futura relación con vehículos, asignaciones y facturas, mientras que el frontend contiene un adaptador provisional que pretende editar datos que pertenecen a Keycloak.

## What Changes

- Incorporar `driver-management` dentro del límite de Fleet para materializar y consultar conductores locales vinculados a una membership `DRIVER` activa y a un tercero activo.
- Aprovisionar el conductor al aceptar una invitación de rol `DRIVER`, de forma atómica con la membership y la auditoría, sin crear ni modificar identidades, credenciales, roles ni perfil personal de Keycloak.
- Permitir a `THIRD_PARTY_ADMIN` consultar, activar y desactivar exclusivamente los conductores de su tercero autorizado; permitir a `DRIVER` consultar únicamente su propio registro en su contexto de tercero.
- Separar el perfil canónico de identidad (nombre, documento y correo, solo lectura para Flota) del estado operativo local del conductor; no habilitar todavía edición de campos operativos hasta contar con un conjunto de datos aprobado.
- Sustituir el marcador y el adaptador frontend provisional de Conductores por un módulo conectado a contratos REST/OpenAPI, con listado, detalle, invitación como alta, transiciones de estado y manejo de contexto, conflictos y denegaciones.
- Alinear las restricciones de elegibilidad de Driver con futuras integraciones de vehículos, asignaciones e invoices, sin implementar esos módulos ni sus reglas de asignación.

## Capabilities

### New Capabilities

- `driver-management`: ciclo de vida operativo, consulta aislada y elegibilidad de conductores vinculados a membresías de terceros.

### Modified Capabilities

- `user-invitations`: la aceptación de una invitación `DRIVER` aprovisiona de manera atómica el registro operativo local correspondiente, sin sustituir el registro autónomo ni el perfil de Keycloak.
- `application-template`: la ruta Conductores deja de ser un marcador y presenta gestión conectada al contexto de tercero, sin editar nombre ni identificación canónicos.

## Impact

Se afectarán el bounded context `fleet` del backend, el flujo de aceptación de invitaciones de Organizations, la composición MongoDB transaccional, OpenAPI 3.1, el adaptador HTTP protegido y `frontend/src/modules/fleet`. Se reutilizan identidad, autorización, contexto organizacional y memberships actuales; no se agregan dependencias, no se modifican grants y no se implementan vehículos, asignaciones, facturas, login ni administración de Keycloak.
