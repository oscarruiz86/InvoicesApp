# Spec Delta

## ADDED Requirements

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
