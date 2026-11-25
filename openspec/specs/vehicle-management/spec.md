# vehicle-management Specification

## Purpose
Administrar la ficha mínima y el ciclo de vida de vehículos de terceros con aislamiento organizacional, concurrencia e historial verificables para los consumidores de Fleet.

## Requirements

### Requirement: Ficha mínima y metadatos de servidor

Cada vehículo MUST exigir placa, número interno y número de tarjeta de propiedad. El servidor MUST normalizarlos y generar identificador, tercero propietario, estado ACTIVE, versión, fechas y actores. MUST rechazar campos vacíos, propiedades desconocidas y metadatos manipulados. MUST NOT incorporar campos adicionales ni modificar identidad o perfiles Keycloak.

#### Scenario: Alta válida
- **WHEN** un administrador autorizado registra los tres campos válidos en su tercero activo
- **THEN** recibe el vehículo ACTIVE con valores normalizados y metadatos de servidor

#### Scenario: Ficha incompleta o manipulada
- **WHEN** se omite un campo requerido o se envía propietario, conductor, versión inicial o un campo desconocido en el cuerpo de alta
- **THEN** responde 400 sin crear vehículo ni evento de éxito

### Requirement: Unicidad resistente a concurrencia

La placa y la tarjeta de propiedad MUST ser únicas globalmente entre vehículos activos e inactivos; el número interno MUST ser único por tercero. Las comparaciones MUST usar valores normalizados. Un conflicto MUST NOT revelar el vehículo, propietario ni datos de otro tercero.

#### Scenario: Registro simultáneo duplicado
- **WHEN** dos solicitudes intentan crear o editar vehículos con una misma clave única
- **THEN** solo una se confirma y la otra recibe 409 sin revelar información ajena

#### Scenario: Número interno en terceros distintos
- **WHEN** dos terceros registran vehículos con el mismo número interno y placas y tarjetas diferentes
- **THEN** ambos registros pueden confirmarse sin compartir acceso

### Requirement: Administración y consulta aisladas

THIRD_PARTY_ADMIN MUST administrar únicamente vehículos de su tercero activo con el permiso de operación vigente. DRIVER MUST consultar únicamente vehículos ACTIVE con asignación activa propia y conductor elegible. APP_ADMIN y COMPANY_ADMIN MUST NOT obtener privilegios operativos implícitos. Los filtros de alcance MUST preceder conteos y paginación.

#### Scenario: Acceso por identificador ajeno
- **WHEN** un actor con permiso en su contexto consulta un vehículo ajeno o inexistente
- **THEN** recibe el mismo 404 neutro sin datos del vehículo

#### Scenario: Sin permiso de operación
- **WHEN** un actor sin permiso solicita una operación de vehículos
- **THEN** recibe 403 antes de consultar la existencia del recurso

#### Scenario: Asignación no verificable
- **WHEN** DRIVER consulta vehículos sin asignación propia activa verificable
- **THEN** no recibe vehículos; un proveedor no disponible produce 503 y nunca acceso permisivo

### Requirement: Edición y estado versionados

Editar placa, número interno o tarjeta y cambiar estado MUST exigir versión vigente. El tercero propietario MUST ser inmutable en este incremento. Las transiciones MUST conservar historial y MUST NOT borrar vehículos. Un cambio efectivo MUST incrementar versión; repetir valores con versión vigente MUST conservarla sin duplicar eventos.

#### Scenario: Edición concurrente
- **WHEN** se envía una edición o transición con versión obsoleta
- **THEN** responde 409 y conserva la última representación confirmada

#### Scenario: Reactivación
- **WHEN** un administrador autorizado reactiva un vehículo INACTIVE con versión vigente en su tercero activo
- **THEN** queda ACTIVE sin restaurar asignaciones ni alterar facturas históricas

### Requirement: Desactivación segura e historial estable

Desactivar un vehículo MUST exigir ausencia comprobada de asignaciones abiertas y MUST bloquearse con 409 si existe alguna. Sin evidencia confiable MUST responder 503. Un vehículo INACTIVE MUST ser no elegible para nuevas asignaciones o facturas. Cambios de ficha o estado MUST conservar referencias históricas y MUST NOT reasignar facturas.

#### Scenario: Vehículo asignado
- **WHEN** se intenta desactivar un vehículo con asignación abierta
- **THEN** se rechaza sin cambiar estado, asignación ni historial

#### Scenario: Desactivación confirmada
- **WHEN** se desactiva un vehículo sin asignaciones abiertas y con versión vigente
- **THEN** el vehículo queda INACTIVE y sus referencias históricas permanecen estables

### Requirement: Confirmación atómica y auditoría

Cada mutación MUST revalidar permiso, contexto, tercero y revisión de recurso al confirmar, y persistir vehículo e historial duradero en una sola transición. Un fallo MUST impedir cambios parciales. Los eventos MUST identificar actor, instante, acción, recurso, correlación y versiones sin tokens, secretos ni cuerpos completos.

#### Scenario: Revocación concurrente o fallo de auditoría
- **WHEN** se revoca la autoridad antes de confirmar o falla la captura duradera del evento
- **THEN** la operación se rechaza sin confirmar una mutación parcial

### Requirement: REST e interfaz verificables

El sistema MUST publicar listado, detalle, alta, edición y estado con Bearer, contexto de tercero explícito y OpenAPI 3.1. La interfaz MUST ofrecer los tres campos, paginación, orden, detalle y acciones según permisos, con confirmación de estado, manejo de conflictos y accesibilidad a 360 y 1280 px.

#### Scenario: Contrato coherente
- **WHEN** se ejecuta una operación documentada
- **THEN** cuerpos, parámetros y respuestas 400, 401, 403, 404, 409, 503 y 500 coinciden con OpenAPI

#### Scenario: Cambio de contexto
- **WHEN** cambia o se pierde el contexto de tercero durante una petición
- **THEN** la UI cancela o descarta la respuesta anterior y limpia datos y formularios dependientes
