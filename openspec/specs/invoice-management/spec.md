# invoice-management Specification

## Purpose

Registrar y consultar facturas manuales vinculadas a una asignación concreta, con adjuntos privados, aislamiento por tercero, edición parametrizada e historial recuperable.

## Requirements

### Requirement: Captura manual con ficha mínima

Cada factura MUST capturar vehículo, fecha, hora, número, NIT emisor, documento adquiriente, valor factura, IVA, otros impuestos y total. MUST permitir adjuntar una imagen. El servidor MUST generar identificador, origen MANUAL, propietario, tercero, asignación, versión y fechas de registro. MUST rechazar metadatos manipulados y propiedades desconocidas.

#### Scenario: Registro válido
- **WHEN** un DRIVER autorizado envía la ficha válida para una asignación propia elegible
- **THEN** se crea una factura MANUAL versionada con metadatos de servidor

#### Scenario: Origen QR manipulado
- **WHEN** el cliente envía origen QR, CUFE o una URL para simular captura automática
- **THEN** responde 400 sin crear la factura ni consultar servicios externos

### Requirement: Asignación explícita y confirmada

Crear MUST confirmar una asignación ACTIVE propia del conductor para el vehículo y tercero activos en el instante de confirmación. La fecha comercial MUST NOT autorizar una asignación histórica cerrada. MUST conservar assignmentId, driverId, vehicleId y propietario inmutables, respetando las relaciones muchos a muchos.

#### Scenario: Varios conductores para un vehículo
- **WHEN** varios conductores tienen asignaciones activas sobre un vehículo y uno registra una factura
- **THEN** la factura conserva exclusivamente la asignación del conductor autenticado sin escoger otra relación por orden de consulta

#### Scenario: Cierre concurrente
- **WHEN** se cierra la asignación antes de confirmar el alta
- **THEN** el alta se rechaza sin factura ni evento parcial

#### Scenario: Vehículo sin asignación válida
- **WHEN** el conductor intenta crear una factura para un vehículo sin asignación ACTIVE propia en el tercero autorizado al instante de confirmación
- **THEN** se rechaza el alta sin persistir la factura ni un evento parcial

### Requirement: Representación decimal y fechas verificables

Los importes MUST ser decimales no negativos con máximo dos decimales y suma exacta valor más IVA más otros impuestos igual a total. Fecha y hora comercial MUST conservarse separadas del instante UTC de registro. NIT, documento y número MUST tratarse como texto; MUST NOT validar identidad del adquiriente mediante Keycloak.

#### Scenario: Total inconsistente
- **WHEN** el total no coincide con la suma exacta o algún importe no cumple el formato
- **THEN** responde 400 sin redondear silenciosamente ni persistir la factura

### Requirement: Acceso aislado por rol

DRIVER con permiso vigente MUST crear y consultar solo facturas propias en su tercero autorizado. THIRD_PARTY_ADMIN MUST consultar facturas de su tercero y editar solo las elegibles con invoices:update. APP_ADMIN y COMPANY_ADMIN MUST NOT recibir acceso implícito. Los filtros de ámbito MUST preceder conteos y paginación.

#### Scenario: Acceso ajeno
- **WHEN** un actor con permiso consulta un identificador ajeno o inexistente
- **THEN** recibe el mismo 404 neutro, también para la imagen

#### Scenario: Falta de permiso
- **WHEN** un actor sin permiso solicita una operación
- **THEN** responde 403 antes de consultar la existencia del recurso

### Requirement: Edición parametrizada y versionada

Editar MUST exigir origen MANUAL, versión vigente y política temporal válida de Configuration. El plazo MUST partir de createdAt con reloj de servidor y límite exclusivo; la política efectiva al editar MUST determinar la duración. Sin servicio o parámetro válido MUST responder 503 sin edición ni plazo fijo de respaldo. Los vínculos, propietario y origen MUST ser inmutables.

#### Scenario: Servicio de parámetros pendiente
- **WHEN** se solicita editar y Configuration todavía no ofrece una política válida
- **THEN** responde 503 y conserva la factura; alta y consulta siguen disponibles

#### Scenario: Ventana agotada o versión obsoleta
- **WHEN** el instante alcanza el límite de edición o se utiliza una versión obsoleta
- **THEN** rechaza la edición con error distinguible sin cambiar datos ni historial

### Requirement: Adjuntos privados

El sistema MUST aceptar como máximo una imagen JPEG o PNG de hasta 5 MiB, validar contenido y servirla únicamente tras autorizar acceso a la factura. MUST NOT exponer rutas públicas ni aceptar URLs remotas. Agregar o reemplazar imagen después del alta MUST aplicar la política y versión de edición.

#### Scenario: Imagen inválida
- **WHEN** se envía un archivo con tipo real diferente, tamaño excesivo o contenido inválido
- **THEN** se rechaza la operación sin crear referencia rota ni adjunto accesible

### Requirement: Duplicidad e idempotencia

El par normalizado NIT emisor y número de factura MUST ser único por tercero. Crear MUST exigir clave de idempotencia por actor y tercero; repetir la misma solicitud MUST recuperar su resultado y reutilizar una clave con otro contenido MUST producir 409. Los conflictos MUST NOT revelar datos ajenos.

#### Scenario: Creación concurrente duplicada
- **WHEN** dos solicitudes intentan registrar la misma clave de negocio en un tercero
- **THEN** se conserva una sola factura y las respuestas distinguen repetición idempotente de conflicto

### Requirement: Historia y trazabilidad durables

Cada mutación MUST confirmar factura, referencia de adjunto y evento durable de forma consistente, revalidando autoridad y revisiones consumidas. El evento MUST registrar actor, instante, recurso, correlación y campos cambiados sin imagen ni documento completo. Cerrar asignaciones o cambiar recursos MUST NOT reescribir facturas históricas.

#### Scenario: Fallo del evento
- **WHEN** falla la captura durable de auditoría
- **THEN** no se confirma la mutación y se conserva el estado anterior

### Requirement: REST e interfaz coherentes

El sistema MUST documentar alta, listado, detalle, edición y lectura de imagen con Bearer y contexto explícito en OpenAPI 3.1. La UI MUST reutilizar los patrones compartidos de Invitaciones, ofrecer filtros y paginación, manejar cambios de contexto y funcionar con teclado a 360 y 1280 px.

#### Scenario: Cambio de contexto durante carga
- **WHEN** cambia o se pierde el tercero activo
- **THEN** la interfaz limpia datos y formularios previos y descarta sus respuestas pendientes

### Requirement: Alta QR diferenciada sobre la misma factura

El sistema MUST registrar facturas QR mediante una operación diferenciada, estableciendo origen QR en servidor y reutilizando asignación confirmada, clave comercial, idempotencia, almacenamiento y auditoría de Invoice. La operación manual MUST seguir rechazando origen QR, CUFE y URL declarados. No se creará un agregado paralelo.

#### Scenario: Alta QR autorizada
- **WHEN** un DRIVER con invoices:create confirma un contenido QR completo para su asignación propia elegible
- **THEN** se registra una factura con origen QR y sus referencias históricas en la misma colección de facturas

#### Scenario: Duplicado entre orígenes
- **WHEN** se intenta registrar por QR una factura con NIT y número ya existentes en el tercero por captura manual
- **THEN** responde 409 sin crear otra factura ni revelar información ajena

### Requirement: Inmutabilidad posterior de factura QR

Una factura QR MUST NOT permitir edición posterior de datos comerciales, vínculos, origen o imagen por ningún rol. Este rechazo MUST preceder la consulta de ventana temporal después de autorizar el acceso al recurso. El detalle MUST informar la razón QR_IMMUTABLE y conservar consulta autorizada e imagen existente.

#### Scenario: Administrador intenta editar QR
- **WHEN** un THIRD_PARTY_ADMIN con invoices:update solicita cambiar una factura QR o reemplazar su imagen
- **THEN** responde 403 QR_IMMUTABLE sin consultar Configuration ni modificar factura o auditoría

### Requirement: Procedencia QR mínima y estable

La factura QR MUST conservar versión del parser y hash del contenido recibido, CUFE y URL si existen, sin guardar contenido completo en logs o auditoría. CUFE MUST ser único por tercero cuando esté presente; registros MANUAL sin CUFE MUST seguir siendo válidos. Una lectura QR MUST NOT certificar la autenticidad de esos datos.

#### Scenario: CUFE ya registrado
- **WHEN** otra captura del mismo tercero presenta CUFE existente con número diferente
- **THEN** devuelve conflicto neutro y no modifica la factura previa

#### Scenario: Consulta histórica
- **WHEN** se cierra la asignación que sustentó una factura QR
- **THEN** las consultas autorizadas conservan origen, campos, procedencia y referencias históricas sin reasignarla
