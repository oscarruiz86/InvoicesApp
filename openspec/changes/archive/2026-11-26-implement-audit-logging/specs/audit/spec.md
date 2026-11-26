# Spec Delta

## ADDED Requirements

### Requirement: Cobertura central de operaciones de negocio
Las mutaciones confirmadas sujetas a auditoría MUST producir un hecho normalizado en el journal compartido, además de cualquier evento local que el módulo necesite. La cobertura MUST incluir organizaciones, terceros, invitaciones y membresías, conductores, vehículos, asignaciones, facturas, decisiones de sincronización offline, parámetros funcionales y catálogos.

#### Scenario: Mutación confirmada en un módulo cubierto
- **WHEN** una operación auditable de uno de los módulos enumerados se confirma
- **THEN** existe un evento central distinto con actor verificado, instante, acción, resultado, correlación, recurso y ámbito validados según aplique
- **AND** su identidad estable corresponde a la operación confirmada

#### Scenario: Operación rechazada antes de confirmar
- **WHEN** una mutación de negocio es rechazada por validación, conflicto o fallo de confirmación
- **THEN** no se registra como mutación exitosa
- **AND** las denegaciones de seguridad continúan sujetas al registro limitado ya especificado

#### Scenario: Reintento de la misma entrega
- **WHEN** se reintenta entregar el hecho de una mutación ya confirmada
- **THEN** el journal conserva una sola representación del hecho y no duplica la operación

### Requirement: Orígenes de dominio normalizados
Audit MUST aceptar orígenes identificables para cada módulo cubierto y conservar una lista controlada de acciones. Los productores MUST mapear sus eventos al contrato compartido y MUST NOT enviar documentos de persistencia, payloads arbitrarios, valores personales completos ni secretos.

#### Scenario: Evento de dominio permitido
- **WHEN** un productor entrega un evento de un módulo cubierto con origen, acción y hechos permitidos
- **THEN** Audit lo normaliza y persiste con su identidad estable

#### Scenario: Evento con contenido no permitido
- **WHEN** un productor intenta incluir credenciales, tokens, claims completos, imágenes, cuerpos HTTP o datos no permitidos para la acción
- **THEN** Audit rechaza el evento o descarta esos campos antes de persistirlo

### Requirement: Consistencia de mutación y evidencia central
Una mutación auditable MUST confirmar su evidencia central de forma atómica o capturarla duraderamente para entrega recuperable antes de informar éxito. Los registros locales necesarios MUST conservar su consistencia con la mutación y la evidencia central.

#### Scenario: Confirmación transaccional
- **WHEN** una mutación y su evento central participan de una misma transacción
- **THEN** ambos se confirman o revierten juntos

#### Scenario: Entrega diferida
- **WHEN** una mutación utiliza entrega diferida para el evento central
- **THEN** el outbox conserva el mismo ID de evento hasta recibir confirmación del journal
- **AND** un fallo o reinicio no pierde ni duplica el hecho

#### Scenario: Falta de capacidad de auditoría
- **WHEN** no es posible persistir la evidencia ni capturarla duraderamente
- **THEN** el productor no presenta la mutación como exitosa

### Requirement: Sin consulta transversal de auditoría
La ampliación de productores MUST NOT exponer el journal compartido mediante endpoints o interfaz de consulta ni conceder `audit:read`. Las consultas funcionales existentes sobre historiales locales MUST conservar sus permisos y contratos.

#### Scenario: Consulta al journal central
- **WHEN** se solicita un historial central de auditoría sin una política de acceso aprobada
- **THEN** no se devuelve información ni se habilita una ruta de consulta

#### Scenario: Consulta funcional existente
- **WHEN** un módulo consulta un historial propio permitido por su contrato actual
- **THEN** la incorporación de eventos al journal central no cambia su alcance, orden ni autorización
