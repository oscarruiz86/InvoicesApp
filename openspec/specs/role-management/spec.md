# Role Management

## Purpose

Permitir administrar de forma controlada la política local de permisos de Invoices App, preservando sus límites de seguridad, continuidad administrativa y trazabilidad.

## Requirements

### Requirement: Política local de roles consultable

El sistema MUST permitir consultar la política vigente solo a un APP_ADMIN autenticado en ámbito GLOBAL con `roles:read`. La respuesta MUST incluir versión, catálogo cerrado de roles, grants efectivos de la política y únicamente los permisos/ámbitos admitidos por el servidor. MUST NOT exponer ni administrar roles, asignaciones o credenciales de Keycloak.

#### Scenario: Consulta global autorizada
- **WHEN** un APP_ADMIN con `roles:read` consulta la política desde ámbito GLOBAL
- **THEN** recibe la versión y la matriz vigente de roles, permisos y ámbitos permitidos

#### Scenario: Consulta desde ámbito no permitido
- **WHEN** un actor sin `roles:read` o un APP_ADMIN fuera de ámbito GLOBAL consulta la política
- **THEN** recibe una respuesta de autorización segura sin revelar la matriz vigente

### Requirement: Catálogo y techo de grants inmutables por la política

La gestión MUST conservar los cuatro roles `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`, así como el catálogo de permisos y combinaciones rol-permiso-ámbito admitidas por el servidor. Una actualización MUST rechazar roles, permisos, ámbitos, duplicados o propiedades fuera de ese techo. MUST NOT crear, borrar, renombrar ni reasignar roles a usuarios.

#### Scenario: Grant fuera del techo
- **WHEN** la actualización contiene un permiso, ámbito o combinación no permitida para un rol
- **THEN** responde solicitud inválida y conserva la política anterior sin registrar un cambio exitoso

#### Scenario: Catálogo cerrado
- **WHEN** la solicitud intenta introducir un rol personalizado o modificar el nombre de un rol existente
- **THEN** se rechaza sin alterar la política ni la identidad de usuarios en Keycloak

### Requirement: Actualización global versionada y auditable

El sistema MUST permitir reemplazar la matriz completa de grants solo a APP_ADMIN en ámbito GLOBAL con `roles:manage`. La solicitud MUST aportar la versión esperada y confirmar la política, su nueva versión y el evento de auditoría como una sola transición. Un conflicto o fallo MUST conservar la política anterior y no afirmar éxito.

#### Scenario: Cambio válido
- **WHEN** un APP_ADMIN autorizado confirma una matriz válida con la versión vigente
- **THEN** recibe la política confirmada con una versión superior y se registra una auditoría de cambio sin secretos

#### Scenario: Conflicto de edición
- **WHEN** dos APP_ADMIN actualizan desde la misma versión
- **THEN** solo una actualización se confirma y la otra recibe conflicto sin sobrescribir la matriz vigente

#### Scenario: Capacidad de auditoría agotada
- **WHEN** no se puede capturar de forma durable el evento `POLICY_CHANGED`
- **THEN** la actualización no modifica la política y responde `503 POLICY_AUDIT_CAPACITY`, sin presentarla como conflicto de versión

### Requirement: Continuidad de administración global

Una política válida MUST incluir los grants `APP_ADMIN / roles:read / global` y `APP_ADMIN / roles:manage / global`. El sistema MUST rechazar una actualización que retire cualquiera de esas capacidades o deje la política sin lectura y administración global efectivas. Esta protección MUST aplicarse antes de persistir el cambio y sin depender de que el navegador o el token afirmen permisos adicionales.

#### Scenario: Retiro del último control administrativo
- **WHEN** un APP_ADMIN intenta guardar una matriz sin cualquiera de los grants globales obligatorios `roles:read` o `roles:manage`
- **THEN** la actualización se rechaza y la política previa permanece vigente

#### Scenario: Actualización del propio actor
- **WHEN** el APP_ADMIN que confirma una actualización conserva ambos grants globales obligatorios
- **THEN** la transición puede confirmarse sin requerir una asignación de rol adicional en Keycloak

### Requirement: Invalidación coherente de permisos y superficie administrativa

Después de una actualización confirmada, el sistema MUST impedir que snapshots, rutas, navegación o acciones continúen presentando permisos obsoletos. El backend MUST reevaluar cada petición con la política vigente; el frontend MUST invalidar y recargar su autorización antes de mostrar el resultado confirmado como disponible.

#### Scenario: Permiso retirado de la sesión actual
- **WHEN** una actualización confirmada retira un permiso que habilitaba una ruta o acción visible
- **THEN** la siguiente evaluación backend la deniega y la interfaz elimina o protege la superficie afectada tras refrescar su snapshot

#### Scenario: Operación en curso
- **WHEN** cambia la política mientras una operación administrativa está pendiente
- **THEN** la operación se confirma solo si su validación de autorización sigue vigente; de lo contrario se rechaza sin aplicar un cambio parcial

### Requirement: Interfaz y contrato administrativo verificables

El sistema MUST publicar lectura y actualización de política en OpenAPI 3.1 con Bearer, ámbito global, versiones y errores documentados. La interfaz MUST mostrar una matriz de solo lectura o edición según permisos, validaciones, confirmación explícita y recuperación de conflictos. MUST mostrar solo la matriz del rol seleccionado a la vez, permitir cambiar de rol desde el catálogo y ser accesible con teclado y legible a 360 px y 1280 px.

#### Scenario: Interfaz autorizada
- **WHEN** un APP_ADMIN global abre Roles y permisos con `roles:read`
- **THEN** ve la matriz vigente y solo ve Guardar si también tiene `roles:manage`

#### Scenario: Administra un rol a la vez
- **WHEN** un APP_ADMIN selecciona otro rol del catálogo
- **THEN** la interfaz muestra únicamente la matriz del rol seleccionado y permite volver a las demás sin perder cambios en el borrador global

#### Scenario: Error de validación o conflicto
- **WHEN** el servidor rechaza una matriz o informa conflicto de versión
- **THEN** la interfaz conserva datos seguros, explica el resultado y permite recargar antes de reintentar

### Requirement: Confirmación y resultado del guardado de la matriz

El guardado de la matriz MUST guiar al administrador con una confirmación propia, un estado de progreso accesible y la respuesta segura del servicio. Completar la solicitud MUST conservar el rol seleccionado si permanece en el catálogo.

#### Scenario: Confirmación en modal
- **WHEN** un APP_ADMIN con cambios selecciona Guardar cambios
- **THEN** la aplicación abre un modal que resume el reemplazo y la versión vigente; cancelar conserva el borrador y no envía la solicitud

#### Scenario: Envío confirmado y en curso
- **WHEN** el administrador confirma el modal
- **THEN** la solicitud se envía una sola vez, el modal muestra progreso accesible acorde con los patrones existentes y sus acciones quedan bloqueadas durante el envío

#### Scenario: Respuesta exitosa del servicio
- **WHEN** el servicio confirma la actualización y devuelve la nueva versión
- **THEN** la interfaz muestra el resultado confirmado y esa versión, cierra el modal y conserva seleccionada la pestaña del rol activa

#### Scenario: Respuesta de error del servicio
- **WHEN** el servicio devuelve un conflicto u otro error recuperable, incluida la capacidad de auditoría agotada
- **THEN** la interfaz comunica el error seguro, conserva el borrador y la pestaña activa, y ofrece recarga cuando la respuesta la requiera

#### Scenario: Finalización después de cambiar de pestaña
- **WHEN** el administrador cambia la pestaña del rol mientras revisa el borrador y luego termina el guardado
- **THEN** la respuesta del servicio no cambia la pestaña activa si ese rol continúa en el catálogo
