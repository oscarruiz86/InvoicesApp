# Spec Delta

## Purpose

Gestiona asignaciones verificables entre conductores y vehículos de un tercero, preservando su historial, aislamiento organizacional y las decisiones operativas de Flota.

## ADDED Requirements

### Requirement: Asignación elegible y aislada

El sistema MUST crear una asignación solo entre un vehículo ACTIVE y un conductor elegible del mismo tercero activo. Solo un THIRD_PARTY_ADMIN con `vehicles:assign` vigente podrá crearla. La solicitud MUST identificar de forma explícita el tercero, vehículo y conductor; los metadatos, sujeto, fechas, estado, versión y actores MUST ser controlados por el servidor.

#### Scenario: Alta autorizada

- **WHEN** un THIRD_PARTY_ADMIN autorizado asigna un vehículo ACTIVE a un conductor elegible de su tercero activo
- **THEN** se confirma una asignación ACTIVE con identificador, versión, inicio UTC y referencias inmutables de los participantes

#### Scenario: Participante ajeno o no elegible

- **WHEN** se intenta asignar un vehículo o conductor de otro tercero, INACTIVE o sin elegibilidad vigente
- **THEN** la operación se rechaza sin revelar recursos ajenos ni crear una asignación

### Requirement: Relación muchos a muchos y par activo único

Un vehículo y un conductor MUST poder participar en varias asignaciones ACTIVE con participantes distintos. El sistema MUST impedir únicamente que se repita el mismo par activo de tercero, vehículo y conductor. Los selectores MUST ofrecer todos los vehículos y conductores activos elegibles del tercero, aunque ya tengan otras asignaciones. Solo un THIRD_PARTY_ADMIN con `vehicles:unassign` vigente podrá cerrar una relación; el cierre MUST afectar solo al par seleccionado y conservar su historial.

#### Scenario: Se permite compartir vehículo o conductor

- **WHEN** se asigna un vehículo activo a otro conductor elegible, o un conductor elegible a otro vehículo activo
- **THEN** se crea la nueva asignación ACTIVE y se conservan las demás relaciones sin cambios

#### Scenario: Par activo duplicado

- **WHEN** se intenta crear otra asignación ACTIVE para el mismo tercero, vehículo y conductor que ya forman un par activo
- **THEN** responde 409 y conserva la relación existente sin crear una segunda

#### Scenario: Opciones ya relacionadas

- **WHEN** se abre el formulario de asignación y un conductor o vehículo activo ya participa en otras relaciones
- **THEN** ambos siguen disponibles en los selectores mientras sean elegibles; la combinación ya activa se rechaza como duplicada

#### Scenario: Cierre de una sola relación

- **WHEN** un administrador cierra una relación activa con su versión vigente
- **THEN** solo ese par queda CLOSED y las demás relaciones de su conductor y vehículo permanecen ACTIVE

### Requirement: Historial y cierre versionados

Cerrar una asignación ACTIVE MUST exigir versión vigente, producir una fecha de cierre UTC controlada por el servidor y conservar sus referencias históricas. Una asignación CLOSED MUST NOT reabrirse, editarse ni borrarse; una petición que ya refleja el estado confirmado MUST ser idempotente.

#### Scenario: Cierre concurrente

- **WHEN** se intenta cerrar una asignación con una versión obsoleta
- **THEN** responde 409 y conserva la representación confirmada

#### Scenario: Cierre repetido

- **WHEN** se vuelve a solicitar el cierre de una asignación ya CLOSED con su versión vigente
- **THEN** devuelve su representación vigente sin cambiar versión ni generar un segundo evento de cierre

### Requirement: Consulta de asignaciones por rol

Un THIRD_PARTY_ADMIN con `assignments:read` MUST consultar únicamente las asignaciones de su tercero activo, incluyendo el historial. Un DRIVER con ese permiso MUST consultar únicamente sus propias asignaciones ACTIVE y sus datos autorizados. Los ámbitos MUST aplicarse antes de los conteos, filtros, páginas y detalles.

#### Scenario: Consulta administrativa

- **WHEN** un THIRD_PARTY_ADMIN autorizado consulta el listado de asignaciones de su tercero activo
- **THEN** recibe resultados paginados, ordenables y filtrables de su ámbito, con estado y participantes seguros

#### Scenario: Consulta de conductor o identificador ajeno

- **WHEN** un DRIVER consulta asignaciones o un actor consulta un identificador fuera de su ámbito
- **THEN** recibe únicamente sus asignaciones ACTIVE propias o un resultado neutro equivalente a inexistente

### Requirement: Desactivación dependiente segura

Un vehículo o conductor con asignación ACTIVE MUST NOT poder desactivarse. La comprobación de ausencia de asignaciones abiertas MUST ocurrir al confirmar la transición y, si la evidencia no está disponible, MUST fallar de forma cerrada sin cambios parciales.

#### Scenario: Desactivación con asignación activa

- **WHEN** se intenta desactivar el vehículo o conductor participante de una asignación ACTIVE
- **THEN** responde 409 y mantiene activos tanto el participante como la asignación

#### Scenario: Proveedor de asignaciones no disponible

- **WHEN** no se puede confirmar la ausencia de asignaciones activas durante una desactivación
- **THEN** responde 503 y no cambia el estado del recurso

### Requirement: Consistencia, auditoría y contrato operativo

Las mutaciones MUST revalidar autorización, contexto, elegibilidad y versiones al confirmar, sin persistir estados parciales. MUST registrar auditoría durable sin secretos y publicar operaciones REST documentadas en OpenAPI 3.1. La interfaz MUST ofrecer administración accesible a 360 y 1280 px, con estados de carga, vacío, error, conflicto y cambio de contexto.

#### Scenario: Cambio concurrente de elegibilidad

- **WHEN** se revoca la elegibilidad, el permiso o el contexto antes de confirmar una creación o cierre
- **THEN** la operación no se confirma y no deja una asignación ni evento parcial

#### Scenario: Cliente y contrato coincidentes

- **WHEN** un cliente autorizado ejecuta una operación documentada de asignaciones
- **THEN** los parámetros, cuerpos y respuestas 400, 401, 403, 404, 409, 503 y 500 coinciden con OpenAPI
