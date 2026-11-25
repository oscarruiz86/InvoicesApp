# Spec Delta

## MODIFIED Requirements

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
