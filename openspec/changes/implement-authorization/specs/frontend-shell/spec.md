# Frontend Shell — Authorization Delta

## ADDED Requirements

### Requirement: Permisos de interfaz obtenidos del backend
La interfaz MUST obtener permisos efectivos desde GET /api/auth/permissions mediante el transporte autenticado existente. MUST NOT inferirlos de roles locales, claims decodificados o una matriz exclusiva del navegador. MUST mantener estado de carga, disponibilidad, denegación y error sin persistir credenciales ni snapshots entre sesiones.

#### Scenario: Carga inicial de permisos
- **GIVEN** sesión autenticada y un ámbito solicitado
- **WHEN** la interfaz carga permisos
- **THEN** las acciones dependientes permanecen inhabilitadas hasta recibir una respuesta válida del backend
- **AND** un error o respuesta malformada no habilita acciones por defecto

#### Scenario: Manipulación del estado local
- **GIVEN** un cliente que altera roles o permisos en memoria
- **WHEN** solicita directamente una operación protegida
- **THEN** la autorización backend sigue siendo obligatoria y rechaza lo no permitido

### Requirement: Protección de rutas y acciones por permiso y contexto
La interfaz MUST complementar la protección de sesión con permiso y contexto para rutas, menús y acciones. MUST ocultar o deshabilitar acciones no autorizadas, mostrar acceso denegado cuando corresponda y evitar render privado durante carga. Los controles MUST ser reutilizables y MUST NOT sustituir comprobaciones del backend.

#### Scenario: Conductor sin administración
- **GIVEN** DRIVER con permisos de su contexto y módulos visibles registrados
- **WHEN** se muestra navegación o intenta una ruta de administración de empresas
- **THEN** no ve ese menú y el acceso directo muestra denegación sin renderizar contenido administrativo

#### Scenario: Administrador de tercero
- **GIVEN** THIRD_PARTY_ADMIN con snapshot válido para un tercero
- **WHEN** navega o visualiza acciones
- **THEN** solo se habilitan módulos y acciones implementados con permisos correspondientes al contexto
- **AND** no aparecen empresas o terceros ajenos por su rol

#### Scenario: Edición de una instancia
- **GIVEN** permiso invoices:update y una factura cuya elegibilidad pública indica edición prohibida
- **WHEN** se presenta el botón de edición
- **THEN** permanece oculto o deshabilitado
- **AND** permitir otra instancia no evita reevaluación backend al intentar guardar

### Requirement: Invalidación inmediata al cambiar sesión o contexto
La interfaz MUST vaciar permisos anteriores al cerrar sesión, cambiar usuario o cambiar contexto. MUST cancelar cargas anteriores e ignorar respuestas de otra generación de sesión/contexto. El futuro selector de Organizations MUST notificar el cambio mediante un contrato, sin duplicar su selección o persistencia dentro de autorización.

#### Scenario: Respuesta tardía de otro contexto
- **GIVEN** solicitud pendiente para A y cambio a B
- **WHEN** llega la respuesta de A después de iniciar B
- **THEN** no repuebla permisos ni habilita acciones en B
- **AND** solo la respuesta vigente de B puede habilitarlas

#### Scenario: Logout con consulta pendiente
- **GIVEN** permisos cargados y una actualización en curso
- **WHEN** termina localmente la sesión
- **THEN** se vacían permisos y datos privados y ninguna respuesta tardía restaura acceso

### Requirement: Actualización de permisos durante la sesión activa
La interfaz MUST actualizar permisos tras autenticar, renovar el token, cambiar contexto, recuperar foco o recibir 403, y cada 30 segundos mientras la vista esté activa. Un snapshot vencido MUST dejar de habilitar acciones hasta renovarse. La renovación MUST usar el flujo de autenticación existente y MUST NOT exponer tokens al estado de presentación.

#### Scenario: Renovación con pérdida de rol
- **GIVEN** sesión activa cuyo nuevo Access Token ya no incluye un rol
- **WHEN** concluye la renovación
- **THEN** se invalida el snapshot previo y se consultan permisos con la nueva identidad
- **AND** no se conserva una acción por los roles o permisos anteriores

#### Scenario: Pestaña vuelve de segundo plano
- **GIVEN** un snapshot anterior y una asociación revocada mientras la pestaña estaba inactiva
- **WHEN** vuelve a foco
- **THEN** no habilita acciones con el snapshot vencido y actualiza sus permisos antes de permitirlas

### Requirement: Errores de autorización diferenciados de sesión
La interfaz MUST distinguir 401, 403, 404 y errores de disponibilidad. Un 401 MUST usar la invalidación de sesión existente; 403 MUST mostrar acceso denegado sin bucle de login; 404 MUST mostrar recurso no disponible sin revelar pertenencia. Fallos de permisos MUST impedir acciones dependientes y permitir reintento explícito sin tratar 403/503 como contraseña incorrecta.

#### Scenario: Acceso denegado autenticado
- **GIVEN** usuario autenticado y una operación que responde 403
- **WHEN** se procesa el rechazo
- **THEN** se invalida/actualiza el snapshot afectado y se presenta denegación sin cerrar sesión ni repetir login automáticamente

#### Scenario: Servicio de autorización indisponible
- **GIVEN** sesión válida y consulta de permisos que devuelve 503
- **WHEN** se presenta el estado
- **THEN** las acciones dependientes no se habilitan y el usuario puede reintentar sin perder su sesión

### Requirement: Controles de autorización verificables sin módulos ficticios
Los controles de interfaz MUST poder probarse con servicios sustituibles y rutas/componentes de prueba. La entrega MUST conservar el shell y la sesión existentes sin añadir CRUD ni menús de módulos no implementados. La integración del selector real MUST verificarse cuando Organizations esté disponible, sin afirmar que un doble de prueba constituye ese selector.

#### Scenario: Verificación del shell existente
- **GIVEN** los módulos de negocio y selector organizacional aún no están implementados
- **WHEN** se validan guards, navegación, sesión y cambio de contexto con fixtures
- **THEN** se prueba su contrato sin publicar pantallas de negocio ficticias
- **AND** la integración organizacional real permanece identificada como dependencia pendiente
