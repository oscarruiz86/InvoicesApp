# parametric-catalogs Specification

## Purpose

Proveer catálogos consistentes y administrables para datos de referencia usados por varios módulos, usando códigos estables desde la creación de registros y evitando referencias inválidas.

## Requirements

### Requirement: Consulta y administración autorizada de catálogos
El sistema MUST exponer catálogos de lectura autenticada. APP_ADMIN con `parameters:update` MUST poder editar etiquetas y dejar auditoría. MUST permitir crear tipos documentales y elementos geográficos con códigos y relaciones validados; MUST permitir desactivarlos lógicamente si no tienen elementos hijos ni registros asociados. MUST conservar auditoría e historial, sin borrado físico. MUST NOT permitir crear o desactivar estados de negocio ni desactivar NIT.

#### Scenario: Lectura autenticada
- **WHEN** un usuario autenticado consulta un catálogo
- **THEN** recibe únicamente elementos disponibles, con códigos y etiquetas, y sin metadatos internos

#### Scenario: Etiqueta editada por administrador
- **WHEN** APP_ADMIN con `parameters:update` cambia la etiqueta de un elemento existente
- **THEN** conserva su código y disponibilidad, aumenta su versión y registra actor, fecha y valor anterior/nuevo

#### Scenario: Operación fuera de permisos
- **WHEN** se intenta crear o desactivar un elemento administrable, o cambiar una etiqueta sin `parameters:update`
- **THEN** el sistema deniega la operación sin cambiar el catálogo

#### Scenario: Alta y baja lógica
- **WHEN** APP_ADMIN con `parameters:update` crea un elemento documental/geográfico válido o desactiva uno sin dependencias
- **THEN** se valida su código y relación padre-hijo; la baja lo marca inactivo, aumenta su versión y registra auditoría sin borrarlo físicamente

#### Scenario: Baja bloqueada por referencias
- **WHEN** se intenta desactivar un elemento geográfico con hijos o empresas/terceros asociados
- **THEN** la operación se rechaza y el elemento permanece activo

#### Scenario: Estados de negocio protegidos
- **WHEN** se intenta crear o desactivar un estado de negocio
- **THEN** el sistema deniega la operación y conserva las transiciones propias de cada entidad

### Requirement: Catálogo de tipos de documento
El sistema MUST ofrecer tipos de documento con códigos y etiquetas para formularios y validaciones. Los documentos personales colombianos MUST incluir CC, CE, TI, RC, PA y PPT; las personas jurídicas MUST continuar usando NIT según las reglas tributarias de su módulo.

#### Scenario: Selección de documento personal
- **WHEN** un usuario registra o actualiza su perfil
- **THEN** puede seleccionar un tipo de documento personal disponible y el código se valida contra el catálogo

#### Scenario: Tipo inactivo en registro nuevo
- **WHEN** se envía un tipo de documento deshabilitado para una nueva identidad
- **THEN** la operación se rechaza con error de validación y sin persistir el cambio

### Requirement: Catálogos geográficos con jerarquía e identificadores oficiales
El sistema MUST relacionar país, departamento y municipio/ciudad por códigos estables y parentales. Para Colombia, MUST usar códigos y jerarquía DIVIPOLA; el nombre mostrado MUST ser etiqueta del catálogo y no la identidad del registro.

#### Scenario: Selección geográfica dependiente
- **WHEN** se registra o edita una ubicación en Colombia
- **THEN** el municipio elegido pertenece al departamento elegido y este pertenece a Colombia

#### Scenario: Código territorial inválido
- **WHEN** se presenta un código DIVIPOLA inexistente, inactivo o con padre incompatible
- **THEN** se rechaza la escritura y no se persiste una ubicación inconsistente

### Requirement: Carga inicial de catálogos y reinicio de datos de prueba
El sistema MUST permitir cargar DIVIPOLA y los catálogos iniciales de manera repetible. En desarrollo, la preparación del cambio MUST permitir limpiar registros sintéticos existentes de empresas, terceros y dependencias de prueba antes de exigir referencias por código; MUST validar el entorno y destino y MUST abortar fuera de desarrollo.

#### Scenario: Carga inicial repetible
- **WHEN** se carga de nuevo la misma versión de catálogos
- **THEN** no se duplican códigos ni se alteran referencias existentes y se conserva la procedencia de la fuente

#### Scenario: Limpieza en entorno de desarrollo
- **WHEN** un administrador ejecuta la preparación de datos de prueba en una base identificada como desarrollo
- **THEN** el proceso muestra los conteos afectados y elimina únicamente registros sintéticos de empresas, terceros y sus dependencias organizacionales

#### Scenario: Limpieza fuera de desarrollo
- **WHEN** la configuración identifica producción, un destino desconocido o inconsistente
- **THEN** el proceso falla cerrado y no elimina registros

### Requirement: Catálogos de estado compatibles con ciclos de vida
El sistema MUST representar los códigos de estado ya existentes por entidad como elementos consultables con etiquetas. Las etiquetas pueden ser editadas por APP_ADMIN con `parameters:update`; códigos, disponibilidad y transiciones permanecen controlados por la carga y las reglas de cada entidad.

#### Scenario: Etiqueta de estado administrada
- **WHEN** APP_ADMIN con `parameters:update` cambia la etiqueta visible de un estado existente
- **THEN** listados y detalles muestran la nueva etiqueta y las APIs conservan el código estable

#### Scenario: Estado y disponibilidad fuera de gestión
- **WHEN** un cliente solicita crear o desactivar un código de estado desde el catálogo
- **THEN** el sistema lo deniega y las transiciones válidas de la entidad permanecen sin cambios

### Requirement: Uso consistente de parámetros en interfaces y APIs
El sistema MUST usar códigos de catálogo en escrituras y filtros, devolver códigos y etiquetas en lecturas, y filtrar en cascada las opciones de país, departamento y municipio por el elemento padre seleccionado. Al cambiar un padre, la interfaz MUST limpiar las selecciones descendientes que ya no sean válidas. Los clientes MUST NOT depender de etiquetas como identificadores.

#### Scenario: Filtros geográficos en cascada
- **WHEN** el usuario selecciona un país y luego un departamento
- **THEN** la interfaz ofrece solo departamentos de ese país y municipios del departamento seleccionado

#### Scenario: Cambio de filtro padre
- **WHEN** el usuario cambia el país o departamento después de haber elegido una ubicación descendiente
- **THEN** la interfaz limpia los valores descendientes incompatibles y vuelve a cargar las opciones válidas del nuevo padre

#### Scenario: Filtro por código
- **WHEN** se consulta una entidad usando un código de documento o geográfico válido
- **THEN** el resultado aplica el filtro sobre el código normalizado y no sobre variaciones de etiqueta
