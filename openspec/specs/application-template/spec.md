# application-template Specification

## Purpose
Proporciona una estructura administrativa uniforme y accesible para usar las capacidades de Invoices App de forma autorizada.

## Requirements

### Requirement: Estructura administrativa adaptable

La aplicación MUST ofrecer una estructura administrativa con encabezado, navegación por módulos y contenido principal legible a 360 px y 1280 px. Un icono de hamburguesa MUST aparecer antes del título y abrir un sidenav superpuesto en móvil. El encabezado MUST incluir un avatar que abra el contexto y rol actuales, perfil, cambio de contraseña y cierre de sesión. La navegación MUST permitir abrir módulos disponibles para el usuario. El menú MUST ordenar sus grupos como Inicio, Administración, Flota, Facturas, Configuración y Auditoría; MUST mostrar dentro de Administración Empresas, Invitaciones, Usuarios y Entregas de notificaciones, dentro de Flota Conductores, Vehículos y Asignaciones, dentro de Configuración Roles y permisos y Parámetros, y dentro de Auditoría las opciones de auditoría. MUST ocultar cualquier grupo que no tenga opciones autorizadas.

#### Scenario: Navegación en escritorio

- **WHEN** un usuario abre una ruta autorizada a 1280 px
- **THEN** ve el encabezado, el menú lateral y el contenido de la ruta sin desplazamiento horizontal causado por la estructura

#### Scenario: Grupos del menú

- **WHEN** el usuario abre la navegación
- **THEN** ve las opciones permitidas ordenadas dentro de los grupos definidos
- **AND** no ve encabezados de grupo sin opciones autorizadas

#### Scenario: Menú de usuario

- **WHEN** un usuario abre su avatar en el encabezado
- **THEN** ve sus iniciales, Contexto actual y Rol actual como datos separados, la opción de abrir el selector de contexto si tiene más de uno, perfil, cambio de contraseña y cierre de sesión

#### Scenario: Navegación en móvil

- **WHEN** un usuario abre una ruta autorizada a 360 px
- **THEN** puede abrir y cerrar el menú, navegar a una ruta disponible y leer el contenido sin desplazamiento horizontal
- **AND** el sidenav se cierra después de seleccionar una opción

#### Scenario: Selección en escritorio

- **WHEN** el usuario selecciona una ruta en el menú lateral de escritorio
- **THEN** el menú permanece abierto

### Requirement: Navegación condicionada por identidad y contexto

La aplicación MUST mostrar módulos y acciones según los permisos y el contexto organizacional confirmados. MUST actualizar las vistas dependientes tras un cambio de contexto y MUST presentar una respuesta segura cuando una ruta o acción no esté autorizada.

#### Scenario: Ruta no autorizada

- **WHEN** un usuario abre una ruta sin el permiso requerido
- **THEN** la aplicación muestra un estado de acceso denegado sin revelar datos del recurso solicitado

#### Scenario: Cambio de contexto confirmado

- **WHEN** el usuario selecciona una organización y el sistema confirma el cambio
- **THEN** el encabezado muestra el nuevo contexto y la aplicación vuelve a obtener los datos dependientes de ese contexto

### Requirement: Patrones compartidos de interacción

La aplicación MUST ofrecer patrones consistentes para tablas, filtros, formularios, detalles, confirmaciones y estados de carga, vacío, error y éxito. Un estado de petición MUST mostrarse sin reemplazar contenido seguro ya cargado. Los controles MUST tener etiquetas, foco visible y operación con teclado.

#### Scenario: Recuperación de error de listado

- **WHEN** falla la carga de un listado
- **THEN** el usuario ve un mensaje comprensible y puede iniciar un reintento explícito

#### Scenario: Validación de formulario

- **WHEN** un formulario contiene datos rechazados por la validación local o del servidor
- **THEN** la aplicación conserva los valores seguros, identifica los campos afectados y comunica el resultado

#### Scenario: Respuesta no bloqueante

- **WHEN** una petición está pendiente, falla o termina sobre una pantalla con contenido seguro
- **THEN** la aplicación conserva el contenido y muestra el estado de la petición como aviso no bloqueante con reintento cuando aplique

### Requirement: Consulta del módulo Usuarios

La aplicación MUST ofrecer a APP_ADMIN y COMPANY_ADMIN, cuando el permiso confirmado lo permita, un módulo Usuarios que consulte las asociaciones de una empresa seleccionada. La selección de Empresa MUST ser independiente de los filtros avanzados y MUST usar el servicio existente de empresas con búsqueda por nombre, nombre comercial o NIT. Al abrir el selector, MUST precargar las empresas ordenadas por razón social ascendente y MUST permitir buscar y paginar esos resultados. Antes de resolver una empresa, la aplicación MUST ocultar el listado y las acciones de consulta; tras seleccionarla, MUST mostrar el listado, Filtros avanzados y la acción Asociar usuario. DRIVER MUST limitarse a consultar su propio perfil y MUST NOT acceder a esta gestión administrativa.

El listado MUST mostrar Usuario, Empresa, Organización, Rol, Estado y Acciones. MUST omitir Correo como columna y ofrecer Ver y Suspender según permisos. Los encabezados ordenables MUST permitir ordenar por Usuario, Empresa, Organización, Rol y Estado. MUST mostrar paginación cuando haya resultados. La columna Organización MUST identificar el destino de la asociación: para una asociación directa con la empresa MUST indicar `Empresa` y no repetir el nombre mostrado en la columna Empresa; para una asociación de tercero MUST mostrar el nombre del tercero. Un único campo MUST buscar por nombre, correo o número de documento y MUST excluir resultados cuyo nombre, correo o documento no coincida con el criterio solicitado. El número de documento MUST buscarse exactamente cuando el criterio tenga formato de documento. Una asociación suspendida MUST conservar el nombre visible cuando el proveedor de identidad todavía lo informa. Empresa MUST permanecer independiente y no mostrarse como chip. Los demás filtros aplicados MUST mostrarse como chips removibles. Tipo de organización MUST ofrecer Empresa, Tercero y Todos. Todos MUST consultar las asociaciones directas de la empresa seleccionada y las de sus terceros activos asociados; las consultas MUST respetar el permiso de lectura sobre esa empresa. Tipo de organización MUST limitar Organización y Organización MUST limitar Rol. Los avisos de éxito MUST desaparecer automáticamente después de un intervalo breve.

#### Scenario: Empresa no seleccionada

- **WHEN** el usuario abre Usuarios sin elegir una empresa
- **THEN** ve el selector de Empresa y no ve el listado ni Filtros avanzados

#### Scenario: Buscar por nombre o correo

- **WHEN** el usuario escribe un nombre o correo en el campo de búsqueda
- **THEN** el listado contiene solo asociaciones cuyo nombre o correo coincide con la consulta

#### Scenario: Buscar por documento

- **WHEN** el usuario introduce un número de documento en el mismo campo de búsqueda
- **THEN** el listado se limita a las asociaciones cuyo número de documento coincide sin requerir un campo adicional

#### Scenario: Nombre de usuario suspendido

- **WHEN** una asociación está suspendida y el perfil continúa disponible en el proveedor de identidad
- **THEN** el listado sigue mostrando el nombre de la persona junto al estado Suspendido

#### Scenario: Listado de todos los tipos de organización

- **WHEN** un administrador de empresa selecciona Todos en Tipo de organización
- **THEN** el listado combina asociaciones directas de la empresa y asociaciones de sus terceros activos, con paginación y permiso limitados al contexto de esa empresa

#### Scenario: Ordenar una columna

- **WHEN** el usuario activa el encabezado de una columna ordenable
- **THEN** el listado cambia entre orden ascendente y descendente para esa columna

#### Scenario: Ver detalle de usuario

- **WHEN** el usuario selecciona Ver en una asociación
- **THEN** ve nombre, tipo y número de documento, correo, empresa, organización, rol y estado en un modal de solo lectura

### Requirement: Asociación y suspensión de usuarios

La aplicación MUST permitir asociar una cuenta a una empresa conforme a los permisos confirmados por el backend. El flujo MUST seleccionar Empresa y Tipo de organización; Empresa será el destino cuando el tipo sea Empresa y MUST ocultarse el selector de Tercero. Cuando el tipo sea Tercero, MUST mostrar un selector modal con búsqueda por nombre o NIT limitado a terceros de la empresa elegida. El rol MUST depender del destino: Empresa ofrece Administrador de empresa; Tercero ofrece Administrador de tercero y Conductor. El modal MUST colocar Empresa antes de Correo y MUST NOT mostrar campos de búsqueda por nombre o documento; el correo de destino se ingresa una sola vez para emitir la invitación y MUST ofrecer sugerencias de usuarios coincidentes mientras se escribe. Suspender una asociación MUST requerir confirmación.

#### Scenario: Asociar a una empresa

- **WHEN** el usuario selecciona Empresa como tipo de organización
- **THEN** la empresa seleccionada se usa como destino, no se muestra un segundo campo de organización y el rol disponible es Administrador de empresa

#### Scenario: Asociar a un tercero

- **WHEN** el usuario selecciona Tercero como tipo de organización
- **THEN** puede buscar y elegir un tercero de la empresa seleccionada y asignar Administrador de tercero o Conductor

#### Scenario: Cancelar suspensión

- **WHEN** el usuario inicia la suspensión de una asociación
- **THEN** la aplicación presenta una confirmación con Aceptar y Cancelar, y Cancelar conserva la asociación activa

### Requirement: Acciones visibles de módulos
La aplicación MUST ubicar Roles y permisos dentro de Configuración. Los listados de empresa y vehículo MUST exponer acciones de editar y desactivar cuando la sesión tenga permiso. El listado de conductores MUST reemplazar el marcador por la gestión conectada al contexto de tercero: MUST exponer detalle y activar/desactivar cuando la sesión tenga el permiso correspondiente, y MUST NOT ofrecer editar nombre, identificación, correo, credenciales, roles ni memberships canónicos.

#### Scenario: Acciones de una empresa

- **WHEN** un usuario autorizado consulta el listado de empresas
- **THEN** cada empresa muestra Editar y Desactivar como acciones disponibles

#### Scenario: Acciones de conductor

- **WHEN** un THIRD_PARTY_ADMIN abre Conductores en un contexto de tercero autorizado
- **THEN** ve acciones de detalle y de transición de estado según sus permisos, sin controles para editar datos personales canónicos

### Requirement: Representación segura de entregas de notificaciones

La aplicación MUST permitir a los usuarios autorizados consultar las entregas de notificaciones con tipo, canal, fecha, estado `pending`, `sent` o `failed` y resultado técnico saneado. MUST enmascarar el destinatario y MUST excluir cuerpos de correo, tokens de invitación y secretos SMTP.

#### Scenario: Consulta de una entrega enviada

- **WHEN** un usuario autorizado consulta una entrega aceptada por SMTP
- **THEN** ve su tipo, canal, estado enviada, fecha y referencia de respuesta disponible sin ver el cuerpo ni el destinatario completo

#### Scenario: Consulta de una entrega fallida

- **WHEN** un usuario autorizado consulta una entrega fallida
- **THEN** ve el estado, el código técnico saneado y el próximo intento cuando corresponda sin ver secretos ni tokens

### Requirement: Estados de ruta y sesión

La aplicación MUST ofrecer rutas o vistas para carga de sesión, error de autenticación, sesión expirada, contexto ausente, ruta no encontrada y acceso denegado. Tras navegar a una de esas vistas, el foco MUST llegar al título de la pantalla.

#### Scenario: Sesión expirada

- **WHEN** la sesión deja de ser válida durante una operación
- **THEN** la aplicación limpia los datos de sesión mostrados y ofrece volver a autenticarse

### Requirement: Navegación administrativa de terceros

La aplicación MUST mostrar la opción Terceros dentro de Administración cuando el contexto confirmado y los permisos vigentes permitan consultar terceros. MUST dirigirla a la gestión de terceros de la empresa activa o del ámbito global autorizado, y MUST ocultarla para sesiones sin ese permiso o ámbito. La navegación MUST conservar los estados de carga, contexto ausente y acceso denegado existentes.

#### Scenario: Empresa autorizada

- **WHEN** un COMPANY_ADMIN selecciona una empresa activa y tiene `third-parties:read`
- **THEN** ve Terceros dentro de Administración y puede abrir su listado limitado a esa empresa

#### Scenario: Sesión sin acceso

- **WHEN** un usuario sin `third-parties:read` abre el menú o intenta la ruta directamente
- **THEN** no ve la opción y la ruta muestra el estado seguro de acceso denegado sin datos de terceros

#### Scenario: Cambio de contexto

- **WHEN** el usuario cambia o pierde el contexto que habilitaba la gestión de terceros
- **THEN** la navegación y la vista descartan los datos dependientes y vuelven a evaluar los permisos confirmados

### Requirement: Acceso global al módulo Roles y permisos
La aplicación MUST mostrar Roles y permisos dentro de Configuración solo cuando el contexto confirmado sea GLOBAL y el snapshot vigente incluya `roles:read`. La ruta MUST requerir ese mismo permiso y MUST mostrar acceso denegado sin exponer la política si el usuario cambia a un contexto organizacional o pierde autorización.

#### Scenario: Navegación global autorizada
- **WHEN** un APP_ADMIN en contexto GLOBAL tiene `roles:read`
- **THEN** ve Roles y permisos en Configuración y puede abrir la matriz administrativa

#### Scenario: Cambio de contexto o permiso
- **WHEN** el usuario cambia a un contexto organizacional o se invalida su permiso `roles:read`
- **THEN** la navegación deja de mostrar la opción y la ruta deja de presentar datos de la política
