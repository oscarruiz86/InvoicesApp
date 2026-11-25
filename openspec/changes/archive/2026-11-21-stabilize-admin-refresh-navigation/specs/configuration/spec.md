# Spec Delta

## ADDED Requirements

### Requirement: El catálogo expone el valor inicial validado

La respuesta administrativa del catálogo MUST incluir `initialValue` como entero del catálogo inmutable. El cliente MUST validar ese campo junto con el resto del contrato y MUST tratar su ausencia o formato inválido como respuesta no válida.

#### Scenario: Catálogo con valor inicial
- **WHEN** el cliente recibe un registro de parámetro válido
- **THEN** acepta el valor inicial entero junto con el valor vigente y sus metadatos

#### Scenario: Respuesta sin valor inicial
- **WHEN** el cliente recibe un registro sin `initialValue` o con un valor no entero
- **THEN** rechaza la respuesta y muestra el estado de error de consulta

### Requirement: El refresco silencioso de permisos no repite consultas sin cambios

La interfaz MUST conservar el catálogo cargado cuando el refresco de permisos mantiene el mismo contexto global y los mismos permisos efectivos. MUST limpiar los datos administrativos si se revoca el permiso de lectura o se pierde el contexto global.

#### Scenario: Permisos efectivos sin cambios
- **WHEN** se actualizan las credenciales y el permiso `parameters:read` continúa vigente en contexto global
- **THEN** la interfaz mantiene el catálogo y no inicia otra consulta de listado

#### Scenario: Permiso o contexto revocado
- **WHEN** el refresco elimina `parameters:read` o deja el contexto global
- **THEN** la interfaz cancela solicitudes pendientes y limpia catálogo, historial y borrador
