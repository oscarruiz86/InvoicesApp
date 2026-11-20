# driver-management Specification

## Purpose
Gestionar el ciclo operativo local de conductores asociados a terceros, manteniendo separadas la identidad canónica, la autorización vigente y las futuras relaciones de flota.

## Requirements

### Requirement: Conductor local vinculado a identidad y membership

Cada conductor MUST referir un subject de identidad, una membership de tercero y un único tercero. Para crearlo o activarlo, la membership MUST estar activa y tener rol DRIVER, y el tercero MUST estar activo. El registro MUST tener identificador, estado, versión, fechas y actor controlados por el servidor. MUST NOT almacenar credenciales, roles Keycloak, correo, nombre ni documento como atributos editables del conductor.

#### Scenario: Aprovisionamiento desde invitación aceptada

- **WHEN** se acepta una invitación vigente de rol DRIVER para un tercero elegible
- **THEN** existe un conductor ACTIVE vinculado al subject y a la membership aceptada de ese tercero

#### Scenario: Identidad no elegible

- **WHEN** se intenta crear o vincular un conductor sin membership DRIVER activa y aceptada para el tercero
- **THEN** la operación se rechaza sin crear un conductor ni ampliar el acceso de la identidad

#### Scenario: Membership anterior compatible

- **WHEN** se ejecuta la migración explícita sobre una membership activa existente con rol DRIVER y tercero activo
- **THEN** se materializa como máximo un conductor por membership sin fusionar identidades por nombre, correo o documento

### Requirement: Consulta aislada de conductores

Un THIRD_PARTY_ADMIN con `drivers:read` MUST consultar solo conductores de su tercero activo. Un DRIVER con `drivers:read` MUST consultar únicamente su propio conductor en su tercero activo. Los listados, conteos, filtros, páginas y detalles MUST aplicar el ámbito antes de devolver datos; un identificador inexistente o ajeno MUST producir una respuesta neutra.

#### Scenario: Administrador de tercero autorizado

- **WHEN** un THIRD_PARTY_ADMIN consulta conductores desde el contexto de su tercero activo
- **THEN** recibe únicamente registros vinculados a ese tercero, con identidad canónica solo de lectura cuando esté disponible

#### Scenario: Conductor o tercero ajeno

- **WHEN** un DRIVER o administrador solicita el identificador de un conductor fuera de su ámbito
- **THEN** recibe el mismo resultado neutro que para un identificador inexistente y no se revela el registro

### Requirement: Estado operativo versionado y no destructivo

Solo un THIRD_PARTY_ADMIN autorizado con `drivers:deactivate` MUST activar o desactivar un conductor de su tercero mediante una transición explícita y versión vigente. La desactivación MUST exigir evidencia confiable de que el conductor no tiene asignaciones ACTIVE. La transición MUST conservar historial y no borrar el registro, membership, perfil Keycloak ni relaciones históricas. Repetir el estado vigente con la versión actual MUST conservar versión y auditoría.

#### Scenario: Desactivación autorizada

- **WHEN** un THIRD_PARTY_ADMIN desactiva un conductor ACTIVE de su tercero con su versión vigente y sin asignaciones ACTIVE comprobadas
- **THEN** el conductor queda INACTIVE, aumenta su versión y la siguiente operación dependiente lo trata como no elegible

#### Scenario: Desactivación con asignación abierta

- **WHEN** un THIRD_PARTY_ADMIN intenta desactivar un conductor con una asignación ACTIVE comprobada
- **THEN** responde 409 y mantiene el conductor y la asignación sin cambios

#### Scenario: Evidencia de asignación no disponible

- **WHEN** no se puede comprobar la ausencia de asignaciones ACTIVE durante la desactivación
- **THEN** responde 503 y no cambia el estado del conductor

#### Scenario: Conflicto o cambio sin efecto

- **WHEN** se usa una versión obsoleta o se solicita el estado ya vigente
- **THEN** un conflicto conserva el estado confirmado y una solicitud sin efecto devuelve la representación vigente sin evento de transición duplicado

### Requirement: Separación de perfiles y campos operativos aprobados

La gestión MUST presentar nombre, documento y correo obtenidos de Identity únicamente como información canónica de solo lectura. MUST NOT aceptar actualización de esos datos ni de credenciales, roles o memberships mediante rutas de conductores. Mientras no exista un conjunto aprobado de campos operativos, MUST NOT publicar actualización de perfil de conductor aunque el catálogo reconozca `drivers:update`.

#### Scenario: Intento de editar perfil personal

- **WHEN** un administrador envía nombre, documento, correo, subject, roles o datos de Keycloak en una operación de conductor
- **THEN** la solicitud se rechaza sin modificar identidad, membership ni conductor

#### Scenario: Permiso de actualización sin contrato operativo

- **WHEN** un cliente intenta usar `drivers:update` para editar un conductor sin un campo operativo aprobado
- **THEN** no existe una operación que permita cambiar el perfil canónico ni se registra una actualización ficticia

### Requirement: Elegibilidad y contrato de integración de Flota

El sistema MUST considerar elegible a un conductor solo si su registro, membership y tercero permanecen activos. MUST publicar un contrato de lectura de hechos de conductor para módulos propietarios, sin exponer persistencia ni inferir asignaciones. MUST NOT crear, cerrar ni reasignar vehículos, asignaciones o facturas en este cambio.

#### Scenario: Revocación posterior

- **WHEN** se desactiva el conductor, su membership o su tercero antes de confirmar una operación dependiente
- **THEN** el consumidor obtiene un hecho no elegible y no confirma un cambio basado en la evidencia anterior

#### Scenario: Sin asignación inventada

- **WHEN** un consumidor consulta los hechos de un conductor activo sin una asignación de vehículo implementada
- **THEN** recibe solo hechos de conductor y debe obtener la asignación del propietario de Flota correspondiente

### Requirement: Contrato administrativo verificable

Las operaciones de consulta y estado de conductores MUST publicarse en OpenAPI 3.1 con Bearer, contexto de tercero explícito, versiones, paginación y errores documentados. La interfaz MUST mostrar datos seguros, accesibles a 360 px y 1280 px, y conservar estados de carga, vacío, error, denegación, conflicto y éxito sin sustituir la autorización backend.

#### Scenario: Contrato y cliente coincidentes

- **WHEN** un actor autorizado usa la documentación o la pantalla de Conductores
- **THEN** los parámetros, respuestas y errores 400, 401, 403, 404, 409, 503 y 500 coinciden con el contrato publicado

#### Scenario: Cambio de contexto

- **WHEN** el usuario cambia o pierde el contexto de tercero que habilitaba Conductores
- **THEN** la interfaz descarta registros del contexto previo y no ofrece acciones hasta obtener autorización vigente
