# Proposal: Implement Driver-Vehicle Assignment

## Why

La gestión de vehículos ya consulta información provisional sobre asignaciones, pero aún no existe una capacidad propietaria que permita crearlas, cerrarlas, conservar su historial y aplicar sus reglas de negocio. Esto impide relacionar de forma verificable a un conductor elegible con un vehículo del mismo tercero y deja incompleta la consulta operativa de Flota.

## What Changes

- Se incorpora la capacidad **driver-vehicle-assignment** para crear, listar, consultar y cerrar asignaciones entre un conductor y un vehículo del mismo tercero.
- La relación será muchos a muchos: un vehículo podrá tener varios conductores y un conductor podrá usar varios vehículos. Solo se rechazará la repetición del mismo par conductor-vehículo mientras su relación esté activa.
- Las opciones de los selectores incluirán todos los conductores y vehículos activos elegibles, aunque ya participen en otras asignaciones. Cerrar una asignación terminará únicamente ese par y conservará su historial.
- El servidor generará las fechas de inicio y cierre en UTC. Las asignaciones cerradas serán inmutables y se conservarán como historial.
- Solo un `THIRD_PARTY_ADMIN` con los permisos vigentes podrá administrar asignaciones dentro de su tercero activo. Un `DRIVER` solo podrá consultar sus propias asignaciones activas y los vehículos que le correspondan.
- La desactivación de un conductor exigirá evidencia confiable de que no tiene una asignación activa, igual que ya se exige para los vehículos. Las operaciones no cambiarán perfiles, identidades ni atributos de Keycloak.
- La lectura provisional de `vehicle_assignments` se reemplazará por un modelo propietario con controles de concurrencia, auditoría, contrato REST/OpenAPI y una interfaz de administración adaptable.

## Capabilities

### New Capabilities

- `driver-vehicle-assignment`: relación operativa e histórica, aislada por tercero, entre conductores y vehículos.

### Modified Capabilities

- `driver-management`: impide desactivar un conductor cuando se confirma que tiene una asignación activa.

## Impact

- **Backend:** módulo Fleet/Asignaciones, persistencia en MongoDB, contratos de datos de Driver y Vehicle, autorización, Route Handlers, OpenAPI y auditoría.
- **Frontend:** la ruta existente `/assignments` dejará de ser un marcador y ofrecerá listado, detalle, creación y cierre según los permisos y el contexto vigentes.
- **Datos:** la colección existente `vehicle_assignments` se validará, normalizará e indexará como registro propietario; será necesario revisar y migrar de forma segura los documentos existentes.
- **Compatibilidad:** se conservará el contrato actual para comprobar la desactivación de vehículos. No se modificarán facturas ni se implementarán notificaciones o integraciones con Keycloak.
