# Invoice Management

## ADDED Requirements

### Requirement: Vehículo asignado validado al crear
La creación de una factura MUST validar la asignación del vehículo mediante un contrato de Fleet Management, considerando el contexto organizacional autorizado y la referencia temporal aprobada.

#### Scenario: Asignación válida
- **WHEN** un actor autorizado crea una factura con asignación válida para el contexto y referencia temporal requeridos
- **THEN** la creación puede continuar y conserva la referencia de asignación que la sustenta

#### Scenario: Asignación inválida
- **WHEN** el vehículo no tiene una asignación válida para la operación solicitada
- **THEN** el backend rechaza la creación sin persistir la factura

### Requirement: Origen explícito y estable
Cada factura MUST registrar su origen MANUAL o QR al crearse y MUST impedir que una modificación cambie ese origen para eludir las restricciones aplicables.

#### Scenario: Captura por cada origen
- **WHEN** se acepta una factura mediante captura manual o captura QR
- **THEN** se conserva el origen correspondiente como parte de su estado de dominio

#### Scenario: Intento de alterar el origen
- **WHEN** una modificación intenta convertir una factura QR en MANUAL
- **THEN** se rechaza el cambio y se conserva el origen QR

### Requirement: Ventana parametrizable para edición manual
La edición de una factura MANUAL MUST verificar en el backend una ventana temporal parametrizable y los permisos del actor. El cálculo MUST usar un instante controlado por el servidor y la política efectiva de Configuration.

#### Scenario: Edición dentro de la ventana
- **WHEN** un actor autorizado edita una factura MANUAL dentro de la ventana efectiva
- **THEN** la modificación puede aceptarse si satisface las demás invariantes y su garantía de auditoría

#### Scenario: Edición fuera de la ventana
- **WHEN** se solicita editar una factura MANUAL fuera de la ventana efectiva
- **THEN** se rechaza la modificación y se conserva el estado anterior

#### Scenario: Instante en el límite
- **WHEN** el instante de edición coincide con el límite configurado
- **THEN** se aplica de forma determinista la semántica de borde aprobada y documentada

### Requirement: Restricción de edición QR independiente
Las facturas QR MUST aplicar una restricción de edición explícita según la política aprobada. Estar dentro de la ventana de edición manual MUST NOT habilitar por sí solo cambios prohibidos para QR.

#### Scenario: Campo QR protegido
- **WHEN** se intenta modificar un campo protegido de una factura QR sin una excepción expresamente autorizada en la política
- **THEN** el backend rechaza el cambio aunque se encuentre dentro de la ventana manual

### Requirement: Autorización por rol y organización en cada operación
Los casos de uso de facturación MUST verificar el permiso del actor y el contexto organizacional del recurso antes de consultar, crear o modificar facturas. Las validaciones visuales MUST NOT sustituir estos controles.

#### Scenario: Recurso fuera del contexto
- **WHEN** un actor solicita una factura o su modificación fuera de su ámbito organizacional autorizado
- **THEN** el backend deniega el acceso sin exponer datos ni modificar la factura

#### Scenario: Permiso insuficiente dentro de la organización
- **WHEN** un actor asociado a la organización intenta una acción de facturación sin el permiso requerido
- **THEN** la acción se rechaza sin modificar la factura

### Requirement: Modificaciones con trazabilidad recuperable
Toda modificación aceptada de una factura MUST conservar trazabilidad con actor, instante, contexto, recurso y cambios permitidos. El resultado MUST respetar una garantía explícita que evite perder silenciosamente la auditoría ante fallos parciales.

#### Scenario: Modificación confirmada
- **WHEN** se confirma una modificación de factura
- **THEN** su registro de auditoría queda persistido o capturado de forma duradera para entrega posterior conforme a la garantía aprobada

#### Scenario: Fallo sin trazabilidad duradera
- **WHEN** falla el registro y no existe captura duradera que permita recuperarlo
- **THEN** no se informa la modificación como confirmada con éxito

### Requirement: Reglas verificables fuera del transporte
Las invariantes y casos de uso de facturación MUST poder verificarse sin servidor HTTP ni persistencia real, usando contratos de prueba para asignación, permisos, parámetros, reloj, repositorio y auditoría.

#### Scenario: Prueba de una edición rechazada
- **WHEN** se verifica una edición que incumple una invariante con dependencias de prueba
- **THEN** se obtiene el rechazo esperado sin iniciar frameworks ni servicios externos
- **AND** no se solicita una escritura de la factura rechazada
