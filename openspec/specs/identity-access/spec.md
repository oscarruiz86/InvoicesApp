# identity-access Specification

## Purpose

Autenticar usuarios con un proveedor OIDC externo y entregar una identidad verificada a la aplicación, separando credenciales, roles generales y futura autorización organizacional.

## Requirements

### Requirement: Registro y perfil para invitaciones
El registro autónomo y el perfil propio MUST residir en Keycloak conforme a `implement-user-invitations`. MUST incluir nombre completo, correo, tipo documental personal disponible en el catálogo y número documental colombiano; el correo MUST ser no editable en el perfil normal. La aceptación MUST exigir correo actual verificado y perfil completo por puerto de Identity.

#### Scenario: Retorno de invitación sin contexto
- **WHEN** el destinatario se registra o inicia sesión desde una invitación
- **THEN** vuelve a revisarla sin requerir contexto operativo y sin aceptar ni verificar correo automáticamente

#### Scenario: Identidad informativa y autorización local
- **WHEN** se consulta `/api/auth/me` y luego se solicita una operación organizacional
- **THEN** `/me` representa los claims básicos del token; el perfil compartido se lee del proveedor y los roles locales de memberships activas, sin autorizar por roles organizacionales del token
- **AND** APP_ADMIN conserva su fuente global verificada

#### Scenario: Tipo documental provisto por catálogo
- **WHEN** se ofrece el campo de tipo documental en registro o perfil
- **THEN** sus opciones corresponden a códigos y etiquetas disponibles del catálogo y el backend rechaza códigos no permitidos
- **AND** el registro y perfil personales ofrecen solo CC, CE, TI, RC, PA y PPT; NIT no es opción de identidad personal y las empresas/terceros validan NIT o CC según sus propias reglas

### Requirement: Realm y cliente público de desarrollo
El entorno MUST disponer del realm `invoices` y cliente OIDC público `invoices-web`, sin secreto, con Authorization Code Flow y PKCE S256 obligatorio. MUST deshabilitar flujo implícito, Direct Access Grants y cuentas de servicio para ese cliente. Las contraseñas MUST ser gestionadas únicamente por Keycloak.

#### Scenario: Login delegado
- **WHEN** la WebApp inicia autenticación
- **THEN** utiliza el endpoint de autorización de Keycloak con challenge S256, state y nonce
- **AND** el intercambio de código requiere el verifier correspondiente y no un secreto de cliente
- **AND** no existe un formulario propio ni un endpoint de la aplicación que reciba contraseñas

#### Scenario: Flujo no permitido
- **WHEN** se intenta obtener tokens con password grant, flujo implícito o código sin PKCE válido para `invoices-web`
- **THEN** Keycloak rechaza el intento

### Requirement: Destinos OIDC explícitos
El cliente MUST limitar Redirect URIs, post-logout Redirect URIs y Web Origins a valores explícitos de desarrollo. Para el origen predeterminado `http://localhost:5173`, MUST admitir callback `/auth/callback`, retorno de logout `/` y únicamente ese Web Origin, sin comodines globales.

#### Scenario: Redirección admitida
- **WHEN** termina un login o logout iniciado con una URI registrada
- **THEN** Keycloak devuelve el navegador al callback o inicio de la WebApp correspondiente

#### Scenario: Destino ajeno
- **WHEN** una petición utiliza otro origen o una URI de redirección no registrada
- **THEN** Keycloak no autoriza ese destino

### Requirement: Audiencia explícita de API
Los Access Tokens destinados a Invoices App MUST incluir `invoices-api` en `aud`, mediante un mapper de audiencia asociado al cliente web. La audiencia de API MUST NOT inferirse únicamente de `azp`, del ID de cliente frontend ni del ID Token.

#### Scenario: Audiencia emitida
- **WHEN** `invoices-web` obtiene un Access Token para la aplicación
- **THEN** `aud`, como cadena o arreglo, contiene `invoices-api`
- **AND** el mapper no agrega esa audiencia al ID Token

### Requirement: Identidad validada mediante un contrato sustituible
El backend MUST obtener un actor mediante un contrato independiente del proveedor y traducir claims y fallos en adaptadores. Domain y Application MUST permanecer libres de SDK, transporte HTTP y estructuras Keycloak. Los casos de uso MUST poder probarse con implementaciones compatibles sin proveedor real.

#### Scenario: Sustitución del proveedor
- **WHEN** se inyecta un verificador de prueba compatible
- **THEN** se verifican éxito y rechazo de los casos de uso sin Keycloak ni MongoDB y sin cambiar reglas internas

### Requirement: Validación criptográfica del Access Token
Cada solicitud protegida MUST validar firma con JWKS confiable, algoritmo permitido RS256, issuer exacto, audiencia `invoices-api`, expiración y subject no vacío. MUST exigir `exp`, respetar `nbf` si existe, aplicar tolerancia máxima de reloj de 30 segundos y aceptar solo Access Tokens de usuario con claim firmado `typ=Bearer`.

#### Scenario: Token válido
- **WHEN** llega un Access Token con firma y claims válidos
- **THEN** se entrega al caso de uso un actor verificado para esa solicitud

#### Scenario: Token rechazado
- **WHEN** falta `exp` o `sub`, la firma es inválida, el algoritmo no es RS256, el issuer o audience no coincide, o la vigencia incumple la tolerancia
- **THEN** se devuelve 401 sin ejecutar la operación protegida

#### Scenario: Tipo de token incorrecto
- **WHEN** se envía un ID Token, Refresh Token o JWT decodificable sin validación satisfactoria
- **THEN** se devuelve 401 aunque algunos claims coincidan

### Requirement: JWKS confiable y recuperable
El verificador MUST reutilizar claves públicas por proceso con caché de hasta 10 minutos, timeout de 5 segundos y recuperación acotada ante `kid` desconocido. MUST obtener claves solo de configuración confiable, nunca de URLs suministradas por el token. Si no puede verificar identidad, MUST denegar acceso.

#### Scenario: Rotación de firma
- **WHEN** Keycloak publica una nueva clave y llega un token con un `kid` nuevo
- **THEN** el verificador puede actualizar JWKS con limitación de frecuencia y aceptar el token solo tras verificarlo

#### Scenario: Proveedor temporalmente indisponible
- **WHEN** no puede descargarse JWKS
- **THEN** un token verificable con una clave todavía válida en caché puede autenticarse
- **AND** sin clave utilizable se responde 401 y un intento posterior puede recuperarse sin reiniciar el proceso

#### Scenario: Token intenta elegir servidor de claves
- **WHEN** un JWT incluye `jku` o `x5u` hacia otro servidor
- **THEN** esas URLs no se consultan para verificar su firma

### Requirement: Límite HTTP reutilizable de autenticación
El backend MUST aplicar autenticación reutilizable en cada handler protegido. MUST aceptar únicamente un Bearer Token en `Authorization`; credenciales ausentes, ambiguas, malformadas o no verificables MUST devolver 401 con `WWW-Authenticate: Bearer`, `Cache-Control: no-store` y envelope `error.code=UNAUTHENTICATED` sin datos sensibles.

#### Scenario: Solicitud sin autenticación válida
- **WHEN** se omite Authorization, se usa Basic, se envían múltiples credenciales o un Bearer vacío o inválido
- **THEN** se devuelve 401 con mensaje neutro y no se ejecuta el caso de uso

#### Scenario: Credencial enviada por otro canal
- **WHEN** una solicitud incluye un token solo en query string, cuerpo o cookie propia de la aplicación
- **THEN** no se considera autenticada

### Requirement: Consulta de usuario autenticado
`GET /api/auth/me` MUST devolver 200 con `{ user: { id, username, name, email, roles } }` para un actor verificado, sin requerir un rol particular. `id` MUST corresponder a `sub`; username, name y email MUST ser cadenas o null, y roles un arreglo de roles conocidos. MUST enviar `Cache-Control: no-store` y no consultar MongoDB ni devolver tokens o claims completos.

#### Scenario: Perfil disponible
- **WHEN** un usuario presenta un Access Token válido
- **THEN** obtiene exclusivamente su información básica derivada de claims verificados
- **AND** no obtiene organizaciones, contraseñas, permisos de recursos ni datos de otros usuarios

#### Scenario: Perfil parcial sin roles
- **WHEN** el token válido carece de atributos opcionales y de roles conocidos
- **THEN** el endpoint responde 200 con atributos ausentes como null y `roles: []`

### Requirement: Roles generales sin autorización organizacional implícita
El realm MUST definir `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`. El backend MUST obtenerlos de identidad verificada y comprobar en cada operación el permiso requerido, la asociación activa, el contexto y el propietario del recurso. Roles o contextos declarados por el cliente MUST NOT sustituir estas comprobaciones ni conceder acceso transitivo empresa-tercero. No hay asignaciones privilegiadas por defecto ni jerarquías implícitas.

#### Scenario: Roles manipulados o desconocidos
- **WHEN** el cliente declara roles en headers, query o cuerpo, o el token contiene otros roles
- **THEN** esos valores no conceden permisos y los roles desconocidos no aparecen en `/api/auth/me`

#### Scenario: Política de roles preparada
- **WHEN** se prueba una operación protegida de prueba que exige un rol ausente en el actor válido
- **THEN** la política deniega con categoría de autorización traducible a 403, sin crear endpoints de negocio
- **AND** `/api/auth/me` continúa disponible para cualquier actor autenticado

#### Scenario: Rol suficiente sin asociación válida
- **WHEN** un actor presenta el rol general requerido, pero no tiene asociación activa con la organización propietaria del recurso
- **THEN** el backend deniega la operación sin leer ni modificar el recurso

#### Scenario: Contexto o permiso manipulado
- **WHEN** el cliente declara un permiso o selecciona un contexto sin asociación válida
- **THEN** el backend vuelve a resolver actor, asociación y ámbito desde fuentes confiables y deniega la operación

### Requirement: Integración de sesión verificable de extremo a extremo
La integración MUST demostrar con Keycloak real que una visita anónima a una ruta privada inicia OIDC, regresa autenticada, envía un Access Token al backend y muestra la identidad devuelta por `/api/auth/me`. MUST verificar también rechazo backend sin depender de controles visuales.

#### Scenario: Recorrido completo
- **WHEN** el usuario abre la WebApp, entra a `/session` y se autentica en Keycloak
- **THEN** vuelve mediante `/auth/callback`, se establece la sesión OIDC y se consulta `/api/auth/me` con Bearer
- **AND** el backend verifica firma con claves de Keycloak y los claims requeridos, devuelve 200 y la UI muestra la sesión activa

#### Scenario: Acceso directo fuera de la UI
- **WHEN** un cliente HTTP invoca `/api/auth/me` sin token válido
- **THEN** recibe 401 aunque se omita toda la lógica del frontend

### Requirement: Catálogo de permisos explícitos sin privilegios implícitos
El sistema MUST identificar permisos con nombres exactos `resource:action`, sin comodines ni herencia de roles. MUST denegar permisos desconocidos, pendientes o no concedidos expresamente. APP_ADMIN MUST NOT recibir acceso global a recursos operativos por su nombre de rol.

#### Scenario: Permiso sin concesión
- **GIVEN** un actor válido, incluso APP_ADMIN, y una operación no concedida en la matriz
- **WHEN** solicita la operación o declara un permiso en la solicitud
- **THEN** se deniega sin ejecutar el efecto de negocio

#### Scenario: Rol o permiso desconocido
- **GIVEN** roles externos adicionales o un identificador de permiso que no pertenece al catálogo
- **WHEN** se evalúa autorización
- **THEN** esos valores no generan grants ni amplían un alcance

### Requirement: Matriz inicial de operaciones permitidas
El sistema MUST aplicar las concesiones y restricciones de la tabla del escenario siguiente. Toda celda pendiente o no indicada MUST denegarse. CRUD de maestros MUST significar crear, leer, actualizar y desactivar, nunca borrado físico. Una concesión organizacional MUST exigir el vínculo funcional del rol para ese ámbito.

#### Scenario: Evaluación de cada celda de la matriz
- **GIVEN** una identidad válida y todas las condiciones de alcance y recurso cumplidas
- **WHEN** se evalúa cada combinación de la tabla
- **THEN** solo las concesiones explícitas siguientes permiten continuar; P significa pendiente y denegado, — significa denegado

| Permisos | APP_ADMIN | COMPANY_ADMIN | THIRD_PARTY_ADMIN | DRIVER |
| --- | --- | --- | --- | --- |
| companies:create/read/update/deactivate | Todos, global administrativo | read/update asociados | — | — |
| third-parties:create/read/update/deactivate | P | Todos vinculados a sus empresas | read/update asociados | — |
| users:create/read/update/associate | Todos, administrativo global | create/read/associate de administradores de tercero autorizados; update P | P | read propio; update P |
| drivers:create/read/update/deactivate | P | P | Todos del tercero autorizado | read propio; demás — |
| vehicles:create/read/update/deactivate | P | P | Todos del tercero autorizado | read activos asignados; demás — |
| vehicles:assign/unassign | P | P | Ambos del tercero autorizado | — |
| assignments:read | P | P | Del tercero autorizado | Propias activas |
| invoices:create/read/update/delete | P | P | read/update del contexto; create/delete P | create/read/update restringidos; delete P |
| parameters:read/update | Ambos globales | — | — | — |
| parameters:create/deactivate | P | — | — | — |
| roles:read/manage | Ambos globales dentro del catálogo autorizado | — | — | — |
| associations:read/manage | Ambos administrativos globales | Ambos para sus relaciones empresa-tercero y administradores de tercero | P | — |
| audit:read | P | P | P | — |

### Requirement: Delegación administrativa limitada al objetivo autorizado
Registro en Keycloak, incorporación y roles MUST ser controles distintos. Las invitaciones MUST seguir `implement-user-invitations` sin ampliar ni resembrar la política. MUST NOT conceder acceso antes de aceptación, permitir autoescalamiento ni delegar APP_ADMIN.

#### Scenario: Cadena delegable
- **WHEN** un administrador invita dentro de su ámbito
- **THEN** APP_ADMIN invita COMPANY_ADMIN; COMPANY_ADMIN invita THIRD_PARTY_ADMIN de terceros autorizados de sus empresas; THIRD_PARTY_ADMIN invita DRIVER de su tercero mediante los permisos existentes de gestión de conductores

#### Scenario: Asociación fuera de la capacidad delegable
- **GIVEN** COMPANY_ADMIN con permiso de crear/asociar administradores de tercero
- **WHEN** intenta asignar APP_ADMIN, cambiar sus propios privilegios o asociar a una empresa ajena
- **THEN** se rechaza sin crear identidad privilegiada, rol ni asociación

#### Scenario: Alta y asociación autorizadas
- **GIVEN** APP_ADMIN y un objetivo COMPANY_ADMIN válido
- **WHEN** el flujo de invitaciones solicita incorporar ese objetivo
- **THEN** comprueba users:associate y associations:manage y las restricciones del objetivo; el registro autónomo en Keycloak no requiere users:create del destinatario
- **AND** cada paso exige sus garantías de auditoría y consistencia sin conceder más roles

### Requirement: Grants indivisibles para múltiples roles y organizaciones
La autorización MUST combinar identidad, permiso habilitado, rol, capacidad funcional local y alcance dentro de un mismo grant. MUST NOT unir el permiso de un rol con una asociación habilitada solo para otro. La unión de roles MUST conservar las restricciones de cada concesión y las invariantes del recurso.

#### Scenario: Administrador en una empresa y conductor en otra
- **GIVEN** un usuario con COMPANY_ADMIN y DRIVER, administrador solo en A y conductor solo en B
- **WHEN** intenta editar B usando su rol COMPANY_ADMIN
- **THEN** se deniega aunque ambos roles y ambas asociaciones estén activos

#### Scenario: Varias concesiones válidas
- **GIVEN** un actor con varios roles y capacidades activas en varios ámbitos
- **WHEN** un grant completo permite la operación en el contexto solicitado
- **THEN** la evaluación permite continuar solo para ese alcance y sujeto a las invariantes del recurso

### Requirement: Evidencia organizacional autoritativa por solicitud
Toda operación organizacional MUST validar asociaciones activas, capacidad funcional y estado de organizaciones mediante el propietario de esos datos. Identificadores, revisiones o contextos enviados por el cliente MUST ser solicitudes, no pruebas de acceso. Sin evidencia confiable MUST denegarse la operación o declararse indisponible.

#### Scenario: Asociación inactiva o inexistente
- **GIVEN** un permiso de rol y una asociación inactiva o ausente para el contexto solicitado
- **WHEN** se solicita una operación
- **THEN** no se concede acceso ni se modifica el recurso

#### Scenario: Pareja de organizaciones manipulada
- **GIVEN** acceso individual a ciertas organizaciones pero sin relación activa entre la empresa y tercero enviados
- **WHEN** se solicita operar con ambos identificadores
- **THEN** el contexto se rechaza sin inferir una relación o acceso transitivo

#### Scenario: Dependencia organizacional no disponible
- **GIVEN** un token válido y ausencia del proveedor real de asociaciones o fallo de su consulta
- **WHEN** la operación requiere contexto organizacional
- **THEN** devuelve 503 AUTHORIZATION_UNAVAILABLE sin usar asociaciones ficticias ni decisiones positivas anteriores

### Requirement: Contexto explícito sin acceso global por omisión
Las operaciones MUST distinguir alcance propio, global administrativo y organizacional. Contexto organizacional MUST contener empresa, tercero o ambos y validar las relaciones requeridas. El alcance global MUST limitarse a grants administrativos expresos; omitir IDs MUST NOT producir un listado global ni seleccionar automáticamente otra organización.

#### Scenario: Contexto omitido
- **GIVEN** un actor asociado a múltiples organizaciones
- **WHEN** una operación organizacional omite todos los identificadores requeridos
- **THEN** se rechaza la solicitud en lugar de elegir un contexto o devolver recursos globales

#### Scenario: Excepción administrativa delimitada
- **GIVEN** APP_ADMIN con companies:read global
- **WHEN** consulta empresas en alcance global
- **THEN** no requiere asociación a cada empresa
- **AND** ese grant no permite consultar sus facturas o vehículos

### Requirement: Aislamiento de recursos en consultas y escrituras
Cada acceso MUST verificar propietario y contexto del recurso contra evidencia del servidor. Listados, conteos y agregados MUST filtrar por alcance antes de paginar o retornar datos. Escribir un propietario diferente en la solicitud MUST NOT trasladar recursos ajenos al alcance del actor.

#### Scenario: ID de otra empresa o tercero
- **GIVEN** permiso válido en A y un recurso perteneciente a una empresa o tercero B no autorizado
- **WHEN** se consulta o modifica por ID desde A
- **THEN** no se expone ni modifica el recurso y se aplica la respuesta neutra de recurso no disponible

#### Scenario: Conteo o listado cruzado
- **GIVEN** datos de varias organizaciones y permiso de lectura solo en A
- **WHEN** se solicita listado, total o agregado
- **THEN** datos y metadatos incluyen exclusivamente recursos autorizados en A

#### Scenario: Propietario falsificado
- **GIVEN** un recurso ajeno cuyo propietario real consta en el servidor
- **WHEN** el cliente envía su subject o empresa como propietario en una actualización
- **THEN** la autorización usa el propietario persistido y no acepta la modificación

### Requirement: Acceso del conductor a vehículos y asignaciones propios
DRIVER MUST leer únicamente vehículos activos con asignación activa propia y sus asignaciones activas. MUST NOT administrar vehículos, conductores o asignaciones. Crear facturas MUST exigir evidencia de vehículo activo y asignación activa del conductor en el contexto autorizado.

#### Scenario: Vehículo o asignación inactivos
- **GIVEN** DRIVER con invoices:create y un vehículo desactivado, una asignación inactiva o una asignación a otro conductor
- **WHEN** intenta registrar una factura manual o QR
- **THEN** se rechaza sin solicitar persistencia de la factura

#### Scenario: Asignación autorizada
- **GIVEN** DRIVER con asociación válida, vehículo activo y asignación activa propia
- **WHEN** consulta el vehículo o registra una factura en ese contexto
- **THEN** puede continuar con las demás reglas del módulo propietario

### Requirement: Restricciones del conductor sobre facturas
DRIVER MUST consultar solo facturas propias y editar solo facturas propias MANUAL con elegibilidad temporal confirmada por el servidor. MUST NOT editar datos QR, borrar facturas ni eludir una regla cambiando origen o propietario. Las reglas temporales y de captura MUST permanecer bajo sus módulos propietarios.

#### Scenario: Factura ajena
- **GIVEN** DRIVER con invoices:read e invoices:update y factura de otro subject, incluso del mismo tercero
- **WHEN** consulta o intenta editarla
- **THEN** se rechaza sin exponer ni modificar datos

#### Scenario: Manual dentro o fuera del plazo
- **GIVEN** factura propia MANUAL y permiso invoices:update
- **WHEN** el módulo propietario informa elegibilidad temporal válida o vencida
- **THEN** solo el resultado válido permite continuar; el vencido no solicita escritura

#### Scenario: Edición QR por conductor
- **GIVEN** factura propia QR y un conductor con invoices:update
- **WHEN** intenta editar datos, incluso dentro de la ventana manual o enviando origen MANUAL
- **THEN** se rechaza y conserva el origen y datos originales

### Requirement: Consulta propia de permisos efectivos
GET /api/auth/permissions MUST requerir identidad válida y devolver solo permisos del actor en un alcance validado. MUST admitir scope self, global u organization, con self predeterminado; companyId/thirdPartyId solo en organization y al menos uno allí. MUST rechazar parámetros desconocidos, repetidos, IDs vacíos o mayores de 128 caracteres y combinaciones inválidas con 400 INVALID_REQUEST.

#### Scenario: Snapshot de contexto válido
- **GIVEN** actor autenticado con contexto organizacional autorizado
- **WHEN** consulta permisos con scope=organization y sus identificadores
- **THEN** recibe 200 con subject igual a sub, scope, permissions únicos, policyVersion, contextRevision, evaluatedAt UTC y refreshAfterSeconds=30
- **AND** scope contiene kind, companyId y thirdPartyId; los IDs ausentes son null y contextRevision es null solo en self/global
- **AND** no se devuelven credenciales, claims completos ni organizaciones ajenas

#### Scenario: Usuario sin roles y consulta sin contexto
- **GIVEN** una identidad válida sin roles conocidos
- **WHEN** consulta permisos sin parámetros
- **THEN** obtiene 200 en scope self con permissions vacío, sin acceso organizacional ni global
- **AND** GET /api/auth/me conserva su contrato independiente

#### Scenario: Alcance global no autorizado
- **GIVEN** identidad sin grant administrativo global
- **WHEN** consulta scope=global
- **THEN** recibe 403 sin revelar política o recursos globales

#### Scenario: Solicitud de permisos malformada
- **GIVEN** identidad válida
- **WHEN** envía scope=organization sin IDs, IDs en self, parámetros repetidos o subject/roles/permissions como parámetros
- **THEN** recibe 400 INVALID_REQUEST y no cambia permisos ni contexto

### Requirement: Snapshot informativo sin delegación de autoridad
El snapshot de permisos MUST ser una ayuda de interfaz, no credencial ni garantía de acceso a instancias. Todas sus respuestas MUST ser JSON no-store con objetos cerrados; permissions MUST usar el catálogo y versiones MUST ser opacas. Las operaciones protegidas MUST recalcular autorización y elegibilidad aunque el cliente presente una respuesta anterior.

#### Scenario: Snapshot anterior tras revocación
- **GIVEN** un snapshot previamente válido y asociación o permiso posteriormente revocado
- **WHEN** el usuario presenta esa información para operar
- **THEN** el backend reevalúa evidencia actual y rechaza la operación

### Requirement: Protección HTTP obligatoria y errores sin filtraciones
Toda operación privada MUST autenticar antes de autorizar y ejecutar efectos solo tras autorización. Credencial ausente/inválida MUST producir 401; falta de permiso/contexto, 403; recurso inexistente o ajeno dentro de un acceso por ID, 404 idéntico. Configuración inválida MUST conservar su 503 previo a credenciales. Errores MUST usar envelope error.code/message y no-store.

#### Scenario: Autenticación rechazada
- **GIVEN** configuración válida y token ausente, inválido o expirado
- **WHEN** se consulta permisos o una operación protegida
- **THEN** se obtiene 401 UNAUTHENTICATED con WWW-Authenticate Bearer y no se ejecuta la operación

#### Scenario: Permiso ausente y recurso oculto
- **GIVEN** identidad válida sin permiso de operación
- **WHEN** solicita acceso a un recurso
- **THEN** recibe 403 FORBIDDEN sin consultar su existencia
- **AND** si dispone del permiso y contexto pero el recurso no existe o está fuera de alcance, recibe el mismo 404 RESOURCE_NOT_FOUND en ambos casos

#### Scenario: Inventario de endpoints
- **GIVEN** rutas públicas técnicas y rutas privadas registradas
- **WHEN** se comprueba el inventario HTTP
- **THEN** cada ruta privada tiene autenticación y política explícita o excepción de consulta propia
- **AND** health, docs y openapi conservan acceso público; no aparecen CRUD de negocio como parte de este incremento

### Requirement: Actualización acotada de roles y permisos
APP_ADMIN MUST proceder de claims verificados. Los roles organizacionales MUST proceder de pertenencias locales activas aceptadas o migradas explícitamente según `implement-user-invitations`, sin exigirlos en realm_access. Con vida de Access Token de 300 segundos y tolerancia de 30, el token anterior MUST dejar de autenticar al superar exp más tolerancia. Políticas, pertenencias y asignaciones MUST releerse en cada decisión sin caché positiva entre solicitudes.

#### Scenario: APP_ADMIN retirado en Keycloak
- **GIVEN** APP_ADMIN retirado y un Access Token anterior todavía vigente
- **WHEN** se usa ese token y luego uno nuevo sin el rol
- **THEN** el anterior puede mantener sus grants hasta exp más 30 segundos y el nuevo ya no los concede
- **AND** superado ese límite el token anterior se rechaza por autenticación

#### Scenario: Rol organizacional retirado localmente
- **WHEN** se retira un rol local y se solicita otra operación con un token todavía vigente
- **THEN** la operación usa la asignación actual y deniega el permiso retirado sin forzar logout ni enviar notificaciones

#### Scenario: Asociación o política revocada
- **GIVEN** mismo token válido y una revocación confirmada de asociación o permiso
- **WHEN** llega una nueva solicitud
- **THEN** evalúa el estado actualizado y no reutiliza la autorización anterior

### Requirement: Cambios de política limitados y versionados
Cambiar una política MUST exigir roles:manage, versión esperada y auditoría duradera. MUST limitarse al catálogo, roles, alcances y techo de concesiones confirmadas. MUST rechazar permisos pendientes, comodines, roles arbitrarios y escrituras concurrentes obsoletas. La consulta REST de permisos MUST NOT exponer escritura de políticas ni asignación de roles de usuario.

#### Scenario: Intento de ampliar el techo
- **GIVEN** APP_ADMIN autorizado a gestionar políticas
- **WHEN** intenta conceder invoices:delete, acceso operativo global pendiente o un permiso desconocido
- **THEN** se rechaza y conserva la revisión anterior

#### Scenario: Actualización válida o concurrente
- **GIVEN** cambio dentro del techo autorizado y una versión esperada
- **WHEN** coincide con la versión actual y se captura auditoría duradera
- **THEN** se confirma una nueva revisión
- **AND** si la versión es obsoleta o no hay captura duradera, no se confirma ni sobrescribe la revisión vigente

### Requirement: Decisión consistente hasta confirmar una mutación
Una mutación MUST comprobar en su punto de confirmación las revisiones de recurso y evidencia de autorización usadas. Revocaciones o cambios concurrentes invalidantes MUST impedir confirmar con una decisión obsoleta. Los módulos dependientes MUST NOT habilitar escrituras hasta demostrar esa garantía; una denegación MUST preservar datos de negocio.

#### Scenario: Revocación entre evaluación y escritura
- **GIVEN** una decisión favorable y una asociación revocada antes del punto de confirmación
- **WHEN** se intenta confirmar la mutación con la revisión anterior
- **THEN** se rechaza o reevalúa contra la nueva revisión y no se confirma una escritura no autorizada

### Requirement: Auditoría de decisiones y administración sensible
El sistema MUST registrar denegaciones relevantes con controles de volumen y cambios de política, asociaciones, roles y acciones sensibles sin muestreo. Eventos MUST identificar actor verificable, instante, acción, resultado, contexto/recurso seguro y correlación. MUST NOT registrar tokens, credenciales, claims completos ni payloads arbitrarios.

#### Scenario: Acceso denegado auditable
- **GIVEN** rechazo por permiso, contexto o recurso
- **WHEN** se registra o deduplica el evento
- **THEN** se conserva motivo categórico y contador de supresión sin datos sensibles
- **AND** un fallo de auditoría no convierte el rechazo en autorización

#### Scenario: Cambio sensible confirmado
- **GIVEN** una modificación administrativa autorizada
- **WHEN** se pretende confirmar éxito
- **THEN** existe registro o captura duradera recuperable, con identidad estable para entrega idempotente
- **AND** sin esa garantía la operación no se confirma como exitosa

#### Scenario: Rol cambiado fuera de la aplicación
- **GIVEN** un cambio de rol efectuado directamente en Keycloak
- **WHEN** se verifica cobertura de auditoría integral
- **THEN** se exige evento administrativo verificable del proveedor y recolección comprobada
- **AND** observar un token distinto no sustituye el evento ni permite declarar esa cobertura completa

### Requirement: Contrato documentado de autorización REST
La fuente OpenAPI 3.1 existente MUST describir consulta de permisos, esquema cerrado, seguridad Bearer, contexto, restricciones y respuestas 200/400/401/403/503/500. Las operaciones protegidas MUST declarar permisos y alcance o excepción autenticada explícita. Las futuras operaciones por recurso MUST documentar también el 404 neutro.

#### Scenario: Contrato y respuesta concordantes
- **GIVEN** el contrato único publicado y un actor de prueba
- **WHEN** se consultan permisos por Swagger o HTTP directo
- **THEN** respuestas, headers y campos cumplen el contrato y la documentación aclara que el snapshot no autoriza instancias
- **AND** no se duplica /api/auth/me ni se crea /api/auth/context en este cambio

### Requirement: Políticas verificables sin servicios externos
Las decisiones de autorización MUST poder verificarse sin navegador, servidor HTTP, proveedor de identidad o base de datos, usando hechos y contratos sustituibles. La misma semántica MUST mantenerse en adaptadores reales. Las pruebas de autorización MUST distinguir consumo de elegibilidad de cálculos de negocio pertenecientes a otros módulos.

#### Scenario: Elegibilidad proporcionada por otro módulo
- **GIVEN** hechos controlados de asignación inactiva, vehículo desactivado, factura fuera de ventana o QR no editable
- **WHEN** se verifica la decisión con dobles compatibles
- **THEN** se comprueba rechazo y ausencia de escrituras sin reimplementar reglas temporales o de captura
- **AND** la aceptación de la integración real queda pendiente hasta probar sus adaptadores y módulos propietarios
