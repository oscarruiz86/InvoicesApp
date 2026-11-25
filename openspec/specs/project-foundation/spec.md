# Project Foundation

## Purpose

Establecer estándares arquitectónicos verificables para que frontend y backend evolucionen de forma independiente y mantengan sus reglas de negocio aisladas de frameworks y servicios externos.

## Requirements

### Requirement: SOLID obligatorio en ambas aplicaciones
El proyecto MUST aplicar los cinco principios SOLID en frontend y backend: responsabilidad única, extensión mediante contratos, sustitución compatible, interfaces específicas e inversión de dependencias.

#### Scenario: Revisión de un módulo
- **WHEN** se revisa un módulo para aceptar su implementación
- **THEN** se verifica su responsabilidad, sus interfaces específicas y la independencia de las reglas respecto a adaptadores concretos
- **AND** sus implementaciones reales y de prueba respetan el mismo contrato y sus garantías

### Requirement: Límites DDD explícitos y proporcionales
El proyecto MUST documentar propiedad de datos y contratos de los seis bounded contexts propuestos y emplear elementos DDD solo cuando protejan una regla o un límite necesario.

#### Scenario: Colaboración entre contextos
- **WHEN** un caso de uso necesita información de otro contexto
- **THEN** la obtiene por un contrato público con referencias explícitas
- **AND** no accede a modelos internos ni a persistencia del otro contexto

#### Scenario: Evaluación de un patrón
- **WHEN** se propone un agregado, servicio, evento o repositorio
- **THEN** se identifica la regla o el consumidor que justifica el patrón antes de incorporarlo

### Requirement: Clean Architecture y dependencias hacia dentro
Cada módulo MUST separar Domain, Application, Infrastructure y Presentation. Domain MUST permanecer independiente de frameworks y capas externas; Application MUST depender de Domain y abstracciones. El grafo de módulos y capas MUST ser acíclico.

#### Scenario: Dependencia prohibida
- **WHEN** una revisión detecta que Domain importa Application, Infrastructure, Presentation o un framework
- **THEN** el módulo no cumple la arquitectura y no se acepta hasta corregir esa dependencia

#### Scenario: Independencia del caso de uso
- **WHEN** un caso de uso se ejecuta con puertos de prueba
- **THEN** sus reglas pueden verificarse sin interfaz visual, servidor HTTP, base de datos ni proveedor de identidad

### Requirement: Frontend y backend independientes
El sistema MUST mantener frontend y backend como aplicaciones independientes que se comunican por contratos REST públicos, sin compartir modelos internos ni requerir el framework de la otra aplicación para compilarse.

#### Scenario: Validación de independencia
- **WHEN** se revisan la compilación y las dependencias de cada aplicación
- **THEN** ninguna importa código interno de la otra
- **AND** cualquier contrato compartido corresponde a la API pública

### Requirement: Separación de presentación e infraestructura
La presentación MUST delegar la coordinación en casos de uso y acceder a operaciones externas mediante abstracciones. Los componentes visuales y controladores HTTP MUST permanecer libres de persistencia directa y reglas de negocio complejas.

#### Scenario: Adaptador sustituible
- **WHEN** se reemplaza un cliente HTTP o repositorio por un adaptador compatible de prueba
- **THEN** los casos de uso conservan su comportamiento sin modificar sus reglas
- **AND** la presentación no necesita acceder al adaptador concreto

### Requirement: Backend autoritativo
El backend MUST verificar invariantes, permisos y contexto organizacional en cada operación protegida, independientemente del estado y las validaciones del frontend.

#### Scenario: Solicitud sin controles visuales
- **WHEN** un cliente invoca directamente una operación que incumple permisos, contexto o reglas de dominio
- **THEN** el backend la rechaza sin aplicar la modificación solicitada

### Requirement: Contratos REST verificables
La API MUST disponer de contratos OpenAPI que describan solicitudes, respuestas, seguridad, contexto organizacional y errores, sin exponer modelos de persistencia ni detalles internos del proveedor de identidad.

#### Scenario: Conformidad de endpoint
- **WHEN** se acepta un endpoint REST
- **THEN** sus pruebas contrastan entradas, respuestas y errores con el contrato publicado

### Requirement: Pruebas independientes por capa
El proyecto MUST definir pruebas de entidades, objetos de valor, invariantes, casos de uso, repositorios, adaptadores, endpoints y componentes, además de autorización y contexto organizacional. Las dependencias externas MUST poder sustituirse en las pruebas internas.

#### Scenario: Evidencia de una capacidad
- **WHEN** se revisa una capacidad implementada
- **THEN** se aportan pruebas de las capas y contratos afectados, incluidos escenarios de rechazo relevantes
- **AND** la revisión verifica también los límites de dependencias y los principios SOLID

### Requirement: Aprobación previa y arquitectura antes de módulos
El cambio MUST permanecer en planificación hasta recibir aprobación explícita. Las tareas MUST definir y validar las arquitecturas de frontend y backend antes de implementar módulos funcionales y resolver las decisiones aplicables antes de ejecutar sus tareas.

#### Scenario: Artefactos completos sin aprobación
- **WHEN** OpenSpec informa que los artefactos están completos y aún no existe aprobación explícita
- **THEN** no se inicia implementación, instalación de dependencias ni generación de código

#### Scenario: Orden de implementación futura
- **WHEN** se solicita comenzar un módulo funcional tras aprobar la propuesta
- **THEN** primero debe existir evidencia de validación de ambas arquitecturas y de resolución de las decisiones aplicables
