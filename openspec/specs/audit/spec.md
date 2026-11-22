# audit Specification

## Purpose

Conservar trazabilidad durable y privada de las operaciones de negocio con garantías explícitas ante fallos de registro o entrega. No se ofrece consulta de historial hasta aprobar una política de acceso específica.

## Requirements

### Requirement: Hechos de operación mediante un contrato
Los contextos productores MUST registrar los hechos sujetos a auditoría mediante un contrato independiente del mecanismo de almacenamiento o entrega. Los registros MUST identificar actor, instante, contexto organizacional, acción y recurso con los cambios autorizados para trazabilidad.

#### Scenario: Registro de una modificación
- **WHEN** se acepta una modificación de factura sujeta a auditoría
- **THEN** el caso de uso aporta un hecho de operación con los datos exigidos
- **AND** no depende del modelo de persistencia de Audit

### Requirement: Garantía explícita ante fallos parciales
La confirmación de operaciones auditables MUST cumplir una garantía acordada de persistencia atómica o captura duradera recuperable. El sistema MUST NOT perder silenciosamente el vínculo entre una modificación confirmada y su trazabilidad.

#### Scenario: Fallo del almacenamiento de auditoría
- **WHEN** la auditoría no puede persistirse inmediatamente
- **THEN** la operación respeta la garantía aprobada: conserva captura duradera para recuperación o no se confirma como exitosa

#### Scenario: Reentrega cuando se elige entrega diferida
- **WHEN** un hecho capturado de forma duradera se entrega de nuevo tras un fallo
- **THEN** la recuperación preserva su identidad sin duplicar la operación de negocio ni presentar dos hechos distintos para la misma modificación

### Requirement: Historial privado hasta aprobar una política de consulta
Audit MUST NOT exponer un endpoint de historial ni conceder el permiso `audit:read` hasta que exista una política aprobada de consulta, autorización, ámbito y retención. Los registros MUST ser append-only y conservar hechos distinguibles conforme a la política de retención vigente.

#### Scenario: Consulta sin política aprobada
- **WHEN** un actor intenta consultar historial antes de aprobarse la política de acceso
- **THEN** la aplicación no expone el endpoint ni devuelve registros de auditoría

#### Scenario: Nueva modificación del mismo recurso
- **WHEN** una nueva modificación de factura genera trazabilidad
- **THEN** Audit conserva un hecho distinguible sin sobrescribir el anterior

### Requirement: Auditoría separada de decisión de negocio
Audit MUST registrar hechos sin modificar los agregados productores ni decidir permisos o elegibilidad de edición. Su contrato MUST poder sustituirse para probar la coordinación y los fallos de los casos de uso.

#### Scenario: Prueba de fallo de auditoría
- **WHEN** un caso de uso recibe un adaptador de auditoría de prueba que simula un fallo
- **THEN** puede verificarse la garantía de confirmación sin levantar servicios externos ni mover reglas de negocio a Audit

### Requirement: Producers submit normalized audit facts
Backend producers MUST submit an event with a stable event ID, server occurrence time, verified actor or service identity, action, result, correlation ID, and only validated context and resource facts. Audit MUST reject malformed events and MUST NOT accept tokens, credentials, complete claims, or arbitrary request payloads.

#### Scenario: Accept a safe event
- **WHEN** a producer submits a well-formed event with a stable ID and sanitized facts
- **THEN** Audit accepts the event for durable storage

#### Scenario: Reject sensitive event content
- **WHEN** a producer submits credentials, a token, complete claims, or arbitrary payload data
- **THEN** Audit rejects or strips that content before persistence

### Requirement: Audit storage is append-only and idempotent
Audit MUST retain the first accepted representation of an event ID and MUST NOT overwrite or duplicate it when delivery is retried. A duplicate ID with different content MUST be treated as an integrity conflict.

#### Scenario: Retry after an uncertain response
- **WHEN** a producer retries an event after it cannot determine whether the first write succeeded
- **THEN** Audit reports the original event as accepted without creating a second record

#### Scenario: Conflicting reuse of an event ID
- **WHEN** a producer submits the same event ID with different normalized facts
- **THEN** Audit rejects the conflicting event and preserves the original record

### Requirement: Audit records follow two-year retention
Audit MUST retain each accepted record for two years from its server occurrence time and MUST automatically expire it after that retention period. Expiration processing MAY lag the exact boundary but MUST NOT delete a record early.

#### Scenario: Record reaches its retention boundary
- **WHEN** an audit record is younger than two years
- **THEN** it remains stored
- **AND** once it reaches two years it becomes eligible for automatic expiration

### Requirement: Durable captures are delivered and recovered
Producers that commit an operation with deferred audit delivery MUST durably capture the event before reporting success. A delivery process MUST retry captured events until Audit accepts them and MUST acknowledge only the matching event ID after acceptance.

#### Scenario: Recovery after a worker interruption
- **WHEN** delivery stops after Audit accepted an event but before the producer acknowledged it
- **THEN** a restarted worker retries the same event ID and completes acknowledgement without creating a duplicate

#### Scenario: Audit temporarily unavailable
- **WHEN** Audit cannot accept a captured event
- **THEN** the producer retains the durable capture for a later retry
- **AND** the event is not silently discarded

### Requirement: Audit history remains private
Audit MUST NOT expose a history endpoint or grant access based only on the presence of a stored event. Reading audit history remains unavailable until a separate authorization and access policy is approved.

#### Scenario: Unapproved history query
- **WHEN** an actor attempts to read audit history through the application
- **THEN** no audit-history endpoint or data is exposed
