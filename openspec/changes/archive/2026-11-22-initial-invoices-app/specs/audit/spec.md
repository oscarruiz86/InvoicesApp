# Audit

## Purpose

Conservar trazabilidad durable y privada de las operaciones de negocio con garantías explícitas ante fallos de registro o entrega. No se ofrece consulta de historial hasta aprobar una política de acceso específica.

## ADDED Requirements

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
