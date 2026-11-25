# Organizations

## Purpose

Administrar empresas, terceros y asociaciones de usuarios, y proporcionar un contexto organizacional validado que preserve el aislamiento de los recursos del sistema.

## Requirements

### Requirement: Asociaciones y permisos administrados por su contexto
El contexto de Organizations MUST ser dueño de las asociaciones entre usuarios y organizaciones y validar sus cambios mediante casos de uso autorizados. Otros contextos MUST consumir esa información por contratos públicos.

#### Scenario: Asociación sin permiso
- **WHEN** un actor sin permiso solicita asociar un usuario a una empresa o un tercero
- **THEN** se rechaza el cambio y se conserva la asociación anterior

#### Scenario: Consulta desde otro contexto
- **WHEN** otro contexto necesita validar la asociación de un usuario
- **THEN** recibe el resultado mediante un contrato de Organizations sin acceder a su persistencia

### Requirement: Selección de contexto validada por el backend
El backend MUST validar la asociación vigente y los permisos del actor antes de aceptar el contexto organizacional solicitado. La selección en la interfaz MUST NOT conceder acceso por sí misma.

#### Scenario: Selección autorizada
- **WHEN** un usuario selecciona una organización con la que tiene asociación y permisos válidos
- **THEN** el backend proporciona un contexto autorizado para las operaciones permitidas

#### Scenario: Contexto manipulado
- **WHEN** un usuario solicita un contexto sin asociación válida o sin los permisos requeridos
- **THEN** el backend rechaza la selección y no expone datos de esa organización

### Requirement: Aislamiento por operación y recurso
Cada lectura y escritura protegida MUST comprobar que el recurso pertenece al ámbito organizacional autorizado. Omitir el contexto MUST NOT implicar acceso global. Las asociaciones entre empresas y terceros MUST NOT conceder acceso transitivo implícito.

#### Scenario: Acceso por identificador ajeno
- **WHEN** un actor consulta o modifica por identificador un recurso fuera de su ámbito autorizado
- **THEN** no obtiene ni modifica el recurso y recibe un error conforme al contrato sin divulgar datos ajenos

#### Scenario: Listado con contexto omitido
- **WHEN** una consulta protegida omite el contexto requerido
- **THEN** no se devuelve un listado global de recursos

#### Scenario: Cambio de contexto
- **WHEN** el usuario cambia a otra organización autorizada
- **THEN** las siguientes operaciones se evalúan contra el nuevo contexto
- **AND** una selección o caché anterior del frontend no habilita acceso al contexto previo

### Requirement: Reglas organizacionales verificables
Las reglas de asociación, permisos y contexto MUST poder probarse con contratos de identidad y repositorios de prueba, sin depender de frameworks ni del proveedor externo de autenticación.

#### Scenario: Matriz de acceso
- **WHEN** se verifica una combinación de actor, permiso, asociación, contexto y recurso
- **THEN** el resultado de autorización puede comprobarse de forma determinista en un caso de uso
