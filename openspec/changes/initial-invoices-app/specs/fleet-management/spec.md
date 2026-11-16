# Fleet Management

## Purpose

Proteger el ciclo de vida de vehículos, conductores y asignaciones, conservando su historial y proporcionando hechos de asignación verificables a los contextos consumidores.

## ADDED Requirements

### Requirement: Activación y desactivación explícitas
La activación y desactivación de vehículos MUST ejecutarse como transiciones de dominio a través de casos de uso autorizados, con una política explícita sobre las asignaciones abiertas.

#### Scenario: Cambio de estado autorizado
- **WHEN** un actor autorizado solicita una transición válida de estado de un vehículo de su ámbito
- **THEN** el caso de uso aplica la transición conforme a la política aprobada de asignaciones
- **AND** conserva el historial existente

#### Scenario: Transición sin autorización
- **WHEN** el actor carece de permiso o contexto válido para el vehículo
- **THEN** no cambia el estado ni las asignaciones

### Requirement: Cambio de tercero con cierre e historial
Al sustituir una asignación de un vehículo a un tercero, el sistema MUST finalizar la asignación anterior, conservar su período histórico y establecer la nueva sin dejar asignaciones incompatibles simultáneas.

#### Scenario: Reasignación aceptada
- **WHEN** se aprueba el cambio de tercero de un vehículo con asignación vigente
- **THEN** la asignación anterior queda finalizada y consultable en el historial
- **AND** la nueva asignación respeta las reglas de vigencia y compatibilidad aprobadas

#### Scenario: Fallo parcial al reasignar
- **WHEN** falla la persistencia de una parte del reemplazo
- **THEN** no se confirma una reasignación parcial que incumpla las invariantes

#### Scenario: Cambios concurrentes incompatibles
- **WHEN** dos solicitudes intentan establecer asignaciones incompatibles para el mismo vehículo
- **THEN** el sistema preserva la invariante de asignación y no confirma ambas como exitosas

### Requirement: Historial estable frente al estado actual
Los cambios de tercero o estado del vehículo MUST conservar las asignaciones anteriores y MUST NOT reasignar retroactivamente las facturas históricas vinculadas a ellas.

#### Scenario: Consulta después de cambiar tercero
- **WHEN** se consulta la asignación referenciada por una factura anterior al cambio
- **THEN** se conserva el hecho histórico de asignación que sustentó esa factura

### Requirement: Consulta de asignación mediante contrato
Fleet Management MUST exponer hechos de asignación mediante un contrato público verificable, sin exponer modelos de persistencia. El contrato MUST aplicar el contexto autorizado y la referencia temporal acordada para la validación.

#### Scenario: Validación desde facturación
- **WHEN** Invoice Management solicita verificar un vehículo y su asignación
- **THEN** recibe hechos suficientes o un resultado de asignación inválida según la política aprobada
- **AND** no accede directamente a la persistencia de Fleet Management
