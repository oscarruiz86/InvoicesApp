# Spec Delta

## MODIFIED Requirements

### Requirement: Patrones visuales y estados verificables

El diseño SHALL definir patrones compartidos para navegación, tablas, formularios, diálogos y retroalimentación. La interfaz SHALL aplicar esos patrones de forma coherente y reutilizable en los módulos cubiertos. En escritorio, la navegación lateral SHALL permanecer anclada al viewport mientras el contenido usa el scroll normal de la página, y su columna SHALL extenderse hasta el footer; la navegación solo SHALL tener scroll interno si sus elementos exceden el espacio disponible. Los wireframes SHALL documentar escritorio y móvil, navegación por teclado y foco visible, además de carga, vacío, error, permisos y confirmación donde correspondan.

#### Scenario: Revisión en dos tamaños
- **WHEN** se revisan un listado, un formulario y un detalle a 360 px y 1280 px
- **THEN** las acciones principales y mensajes siguen accesibles y las anotaciones indican el orden de foco y el comportamiento adaptable

#### Scenario: Scroll de navegación lateral en escritorio
- **WHEN** se recorre una página larga con el scroll normal del navegador
- **THEN** el sidebar permanece anclado bajo la barra superior, su fondo llega hasta el footer y solo su contenido tiene scroll interno cuando los elementos no caben en el alto disponible
- **AND** el pie permanece al final del documento y el scroll de página sigue funcionando

#### Scenario: Sidebar y scroll en móvil
- **WHEN** se abre el menú móvil
- **THEN** el sidebar se presenta como panel temporal, el contenido de la página mantiene el scroll normal y el menú solo desplaza internamente si su contenido excede el alto disponible

#### Scenario: Módulos con patrones compartidos
- **WHEN** se consultan listados, formularios o detalles de módulos distintos que usan el mismo patrón
- **THEN** conservan una jerarquía, controles y comportamiento responsive coherentes con el wireframe, y las diferencias se limitan a contenido y reglas propias del módulo

#### Scenario: Carga y recuperación de listas
- **WHEN** un listado espera datos, no encuentra resultados o falla al cargarlos
- **THEN** presenta estados de carga, vacío o error distinguibles y una acción de recuperación cuando corresponda, con el mismo tratamiento visual en los módulos que comparten ese patrón

#### Scenario: Paneles independientes en escritorio
- **WHEN** se desplaza el contenido de una página en escritorio
- **THEN** el contenido principal se desplaza con la barra normal del navegador y la barra superior y el sidebar permanecen anclados al viewport

#### Scenario: Columna lateral hasta el footer
- **WHEN** una página tiene contenido que ocupa más de la altura disponible
- **THEN** el fondo de la columna lateral continúa hasta el footer y el sidebar permanece anclado dentro de esa columna durante el scroll

#### Scenario: Navegación más alta que el viewport
- **WHEN** los elementos del sidebar exceden la altura disponible debajo de la barra superior
- **THEN** el sidebar permite desplazamiento interno independiente y conserva accesible toda la navegación

#### Scenario: Navegación móvil
- **WHEN** se abre la navegación en un viewport móvil
- **THEN** aparece como panel temporal y, si sus elementos exceden el espacio disponible, permite desplazamiento dentro del panel sin desplazar la página de fondo

#### Scenario: Acciones de tabla accesibles
- **WHEN** una fila ofrece acciones de consulta, edición o cambio de estado
- **THEN** cada acción se representa con un icono, un tooltip descriptivo y un nombre accesible, alineada a la izquierda y centrada verticalmente en la fila

#### Scenario: Filtros de empresa contextualizados
- **WHEN** se consultan terceros, invitaciones o pertenencias y el usuario puede elegir entre empresas
- **THEN** la empresa se selecciona dentro del modal de filtros y los listados no exigen un selector permanente fuera del toolbar
- **AND** la consulta conserva los límites de autorización del usuario

#### Scenario: Filtrar invitaciones en un contexto de empresa
- **WHEN** un administrador de empresa consulta invitaciones dentro de su contexto activo
- **THEN** puede abrir el filtro de Invitaciones y combinar correo, rol, estado, entrega y tipo de organización
- **AND** el filtro conserva el alcance de la empresa activa y no permite cambiar a otra empresa

#### Scenario: Cerrar filtros sin cambios
- **WHEN** se cierra o cancela un modal de filtros sin aplicar cambios
- **THEN** se conserva el listado visible y no se vuelve a solicitar al servidor
- **AND** aplicar exactamente los mismos valores tampoco genera una consulta nueva

#### Scenario: Detalles sin acciones duplicadas
- **WHEN** se consulta una empresa o un tercero
- **THEN** el detalle presenta la información del registro y la acción de cierre, sin accesos duplicados a edición, cambio de estado, invitaciones, usuarios vinculados o administración de relaciones

#### Scenario: Selector común de empresas
- **WHEN** una persona con permisos aplica filtros de empresa o elige empresa destino en invitaciones o pertenencias
- **THEN** utiliza el selector compartido de empresas con búsqueda, estado de carga, paginación y selección accesibles
- **AND** seleccionar un destino de creación no cambia los filtros activos del listado

#### Scenario: Columnas de empresa
- **WHEN** se consultan terceros o invitaciones
- **THEN** la tabla muestra la empresa asociada después de Razón social en Terceros y después de Correo en Invitaciones
- **AND** las vistas de tarjeta móvil muestran el mismo dato

#### Scenario: Acceso de inicio de sesión
- **WHEN** una persona visitante abre Inicio
- **THEN** puede acceder al flujo existente de inicio de sesión desde una acción visible
- **AND** la acción no se presenta a una persona autenticada

#### Scenario: Carga inicial de pertenencias
- **WHEN** se abre el listado de pertenencias con permiso global sin criterios seleccionados
- **THEN** se consultan todos los registros permitidos sin aplicar ni mostrar un filtro inicial ficticio
- **AND** las acciones de asociación habilitadas por el rol permanecen disponibles aunque la lista esté vacía

#### Scenario: Creación de invitaciones
- **WHEN** un administrador global puede invitar sin tener una empresa activa seleccionada
- **THEN** ve la acción de crear invitación y elige una empresa mediante el selector compartido antes de completar el formulario
- **AND** el modal de filtros distribuye sus campos en una cuadrícula adaptable

#### Scenario: Ancho y carga de páginas de administración
- **WHEN** se consultan Roles, Parámetros, Vehículos o Asignaciones
- **THEN** las vistas ocupan el ancho disponible y presentan la carga con los estados compartidos definidos para listas y tablas

#### Scenario: Carga de tabla
- **WHEN** una tabla consulta registros
- **THEN** conserva el encabezado y presenta filas esqueleto alineadas con las columnas visibles, más un indicador accesible de carga

#### Scenario: Encabezado durante la carga
- **WHEN** una tabla muestra filas esqueleto
- **THEN** los nombres de columna se distribuyen por todo el ancho disponible y permanecen alineados con las columnas de datos

#### Scenario: Vehículos en escritorio y sin resultados
- **WHEN** se consulta Vehículos en un viewport de escritorio, con o sin coincidencias
- **THEN** se conserva la tabla con sus encabezados y acciones de fila con iconos y tooltip
- **AND** el aviso de lista vacía aparece antes de la tabla

#### Scenario: Filtros de facturas
- **WHEN** una persona abre los filtros de Facturas
- **THEN** puede buscar por número o NIT y elegir una placa y un conductor en campos autocompletables
- **AND** los resultados mantienen la tabla y muestran si cada factura proviene de una lectura QR o de registro manual

#### Scenario: Formato de importes durante la escritura
- **WHEN** una persona captura o edita los importes de una factura
- **THEN** los campos agrupan millares con puntos y muestran decimales con coma mientras escribe
- **AND** al guardar se envían importes en formato decimal canónico, sin separadores de miles

#### Scenario: Columna de vehículo en facturas
- **WHEN** se consulta el listado de facturas en escritorio
- **THEN** la columna Vehículo aparece inmediatamente después de Número, antes de Fecha
- **AND** la tabla conserva esta columna en escritorio y las tarjetas muestran el vehículo en móvil

#### Scenario: Vigencia de edición configurada
- **WHEN** existe una política de vigencia válida y la factura manual sigue dentro del periodo permitido
- **THEN** una persona con permiso de edición puede abrir el formulario para modificarla
- **AND** si no se puede confirmar la política, el detalle explica que la vigencia configurada no está disponible sin atribuirlo a un módulo interno

#### Scenario: Acciones de escritorio
- **WHEN** se muestran acciones dentro de filas de tabla en escritorio
- **THEN** se usan iconos con tooltip y nombre accesible, alineados a la izquierda y centrados verticalmente

#### Scenario: Asignaciones sin filtro inicial
- **WHEN** se abre Asignaciones por primera vez o se cambia el contexto
- **THEN** el listado se consulta sin un estado preseleccionado
- **AND** en móvil presenta tarjetas esqueleto sin generar scroll horizontal

#### Scenario: Carga inicial de Roles y Parámetros
- **WHEN** se abre Roles y permisos o Parámetros y aún no hay resultados cargados
- **THEN** se muestra un esqueleto con la estructura de tabla correspondiente y encabezado de módulo, en vez de un aviso genérico aislado
- **AND** la matriz existente permanece visible durante una actualización en segundo plano

#### Scenario: Inicio conserva el marco de navegación
- **WHEN** una persona recarga la ruta de Inicio mientras se inicializa la sesión
- **THEN** el navbar y el sidebar permanecen visibles durante la carga

#### Scenario: Inicio de sesión con Keycloak
- **WHEN** una persona visitante selecciona Iniciar sesión desde Inicio
- **THEN** la app invoca el flujo OIDC de Keycloak y no solicita credenciales en un formulario local
- **AND** `/login` solo muestra avisos si existe un error o un estado de sesión que los justifique

#### Scenario: Crear tercero asociado desde administración global
- **WHEN** una persona APP_ADMIN inicia la creación de un tercero desde contexto global
- **THEN** selecciona una empresa con el selector común antes de guardar
- **AND** la creación y la relación inicial con esa empresa se autorizan y registran en el servidor

#### Scenario: Cancelar creación conserva listado
- **WHEN** se cierra el diálogo de creación de una empresa o un tercero sin enviar la solicitud
- **THEN** se restaura el snapshot visible y no se vuelve a consultar el listado
- **AND** una creación confirmada sí actualiza los datos

#### Scenario: Invitaciones sin resultados
- **WHEN** la consulta de invitaciones no devuelve registros
- **THEN** conserva el encabezado de la tabla y muestra dentro de su cuerpo el mensaje vacío y la orientación para ajustar o limpiar filtros

#### Scenario: Acciones administrativas icon-only
- **WHEN** una fila de Invitaciones, Usuarios vinculados o Parámetros ofrece acciones
- **THEN** sus botones muestran iconos con tooltips y nombres accesibles, sin texto visible repetido en las celdas

#### Scenario: Estado completo de invitación
- **WHEN** se presenta el estado de una invitación en una tabla
- **THEN** la celda conserva visible el nombre completo del estado y no lo trunca

#### Scenario: Detalle y sesión
- **WHEN** se consulta una empresa o un tercero, un perfil o un selector de organización
- **THEN** el estado de empresa se muestra después de Ciudad, el tercero usa la misma distribución de detalle que Empresa, el perfil omite la explicación redundante y el selector no muestra Cerrar sesión

#### Scenario: Contextos seleccionables
- **WHEN** una persona debe elegir una organización o el contexto global
- **THEN** cada opción aparece en una tarjeta con nombre, tipo, roles y acción clara de selección

#### Scenario: Inicio mientras se recupera la sesión
- **WHEN** se recarga Inicio y la autenticación está verificando si existe una sesión vigente
- **THEN** se conserva temporalmente el shell y se indica “Verificando sesión…”
- **AND** si el resultado es anónimo, se ocultan navbar y sidebar y se ofrece el acceso a Keycloak desde una vista pública

#### Scenario: Usuarios vinculados en móvil
- **WHEN** APP_ADMIN consulta pertenencias en el viewport móvil, con o sin filtro de empresa
- **THEN** se muestran tarjetas móviles para cada usuario y sus roles, estado y acciones autorizadas
- **AND** la presentación global no depende de un `companyId` seleccionado localmente

#### Scenario: Landing pública e inicio autenticado
- **WHEN** una persona sin sesión abre la raíz de la aplicación
- **THEN** ve una landing pública con acceso al flujo Keycloak y sin navbar ni sidebar
- **WHEN** una persona autenticada navega a Inicio
- **THEN** ve el panel con accesos según sus permisos y estado de conexión de API en `/home`
- **AND** durante la inicialización OIDC de `/home` se conserva el shell y se comunica el estado de verificación

#### Scenario: Filtros por empresa y tercero
- **WHEN** se filtran terceros en ámbito global
- **THEN** el selector de empresa aparece antes del campo de búsqueda y ocupa el ancho del diálogo
- **AND** la consulta de terceros recibe el identificador de empresa y filtra por relaciones autorizadas
- **WHEN** se elige el tipo Tercero en filtros de Invitaciones o Usuarios vinculados
- **THEN** la opción se puede seleccionar aunque aún no haya empresa y el selector de terceros queda habilitado al escogerla
- **AND** el selector carga terceros usando la empresa del borrador del filtro
- **WHEN** se aplican filtros de Usuarios vinculados por tercero
- **THEN** la consulta de servicio conserva empresa, tipo de organización e identificador del tercero

#### Scenario: Sin resultados en listas administrativas
- **WHEN** Invitaciones o Usuarios vinculados no tienen resultados para los filtros aplicados
- **THEN** el aviso compartido aparece antes de la superficie de tabla y mantiene encabezados cuando la tabla de escritorio se muestra
- **AND** se utiliza el mensaje “No hay empresas que coincidan con la consulta. Ajusta la búsqueda o limpia los filtros.”
- **AND** Usuarios vinculados no repite la acción de asociación debajo del aviso; la acción del toolbar permanece sujeta a permisos

#### Scenario: Encabezados completos durante la carga
- **WHEN** una tabla muestra sus filas esqueleto mientras carga
- **THEN** sus encabezados conservan el ancho de las columnas visibles y llenan el espacio disponible
- **AND** ocultar columnas por breakpoint no deja huecos en la tabla

#### Scenario: Entregas de notificaciones en móvil y escritorio
- **WHEN** se consultan entregas de notificaciones en un viewport de 360 px o 1280 px
- **THEN** en móvil se presentan tarjetas legibles con tipo, fecha, estado, canal, intentos, destinatario enmascarado, resultado y acceso al detalle
- **AND** en escritorio se presenta la tabla con sus encabezados, acciones y paginación
- **AND** durante la carga, el esqueleto ocupa el ancho de las columnas visibles; los estados de error y vacío conservan una acción o explicación apropiada

#### Scenario: Recargar el Inicio autenticado
- **WHEN** una persona actualiza directamente `/home` mientras su sesión de Keycloak sigue activa
- **THEN** la aplicación restaura la sesión mediante `check-sso` y mantiene la ruta `/home`

#### Scenario: Acciones móviles de Parámetros
- **WHEN** se presentan parámetros en tarjetas móviles
- **THEN** las acciones de consulta, historial y edición muestran texto visible en lugar de iconos solos

#### Scenario: Filtros de Usuarios vinculados
- **WHEN** se abre el filtro de Usuarios vinculados
- **THEN** Empresa y búsqueda ocupan el ancho completo, Tipo de organización y Tercero ocupan una fila completa, y Rol/Estado comparten dos columnas
- **AND** las opciones de empresa cargadas continúan seleccionables mientras se refresca el resultado
