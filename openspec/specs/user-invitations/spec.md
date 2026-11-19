# user-invitations Specification

## Purpose
Gestionar la incorporación consentida de usuarios a empresas y terceros, y los roles vigentes de sus asociaciones, con entrega provisional de invitaciones al log para pruebas.

## Requirements

### Requirement: Delegación por ámbito
El sistema MUST conservar roles y permisos existentes. APP_ADMIN invita COMPANY_ADMIN para una empresa; COMPANY_ADMIN invita THIRD_PARTY_ADMIN para un tercero autorizado de su empresa; THIRD_PARTY_ADMIN invita DRIVER para su tercero. MUST impedir autoescalamiento, asignación de APP_ADMIN y delegación fuera del ámbito.

#### Scenario: Invitaciones uniformes
- **WHEN** cada actor autorizado invita al rol permitido en su ámbito
- **THEN** se crea una invitación pendiente sin activar acceso

#### Scenario: Delegación ajena
- **WHEN** el actor intenta invitar a una organización ajena o asignar un rol no delegable
- **THEN** se rechaza sin crear invitación ni revelar datos ajenos

### Requirement: Estados y consulta histórica
Cada invitación MUST conservar estado PENDING, ACCEPTED, REJECTED, CANCELLED o EXPIRED. Solo PENDING sin vencer es activa y admite acciones. La organización remitente MUST poder consultar su historial mediante un actor autorizado, sin que el historial otorgue acceso al perfil.

#### Scenario: Invitación terminal
- **WHEN** se consulta una invitación aceptada, rechazada, cancelada o vencida
- **THEN** se muestra su historial sin acciones de modificación

#### Scenario: Vencimiento efectivo
- **WHEN** se intenta aceptar una invitación cuya fecha de vencimiento pasó
- **THEN** se rechaza aunque un proceso de mantenimiento no haya actualizado su estado persistido

### Requirement: Entrega provisional mediante log
En desarrollo y pruebas, el sistema MUST entregar la invitación escribiendo su enlace completo en un log de entrega identificable. MUST NOT requerir un servicio de notificaciones ni afirmar envío de correo. El modo de log MUST estar explícitamente habilitado y no disponible en producción.

#### Scenario: Enlace utilizable
- **WHEN** un administrador crea o reenvía una invitación en modo log
- **THEN** el log contiene un enlace que abre el flujo real de aceptación y la interfaz indica entrega al log

#### Scenario: Fallo de entrega
- **WHEN** falla la escritura del enlace después de guardar la invitación
- **THEN** se informa fallo de entrega sin activar la asociación y se permite reenvío autorizado

### Requirement: Registro autónomo y perfil colombiano
El usuario nuevo MUST registrarse directamente en Keycloak con nombre completo, correo, tipo y número de documento colombiano y credenciales. La aplicación MUST NOT recibir contraseñas. El correo MUST permanecer no editable en el perfil normal; solo el usuario administra sus demás datos personales.

#### Scenario: Registro nuevo
- **WHEN** el invitado sin cuenta elige registrarse
- **THEN** completa el formulario de Keycloak y vuelve a revisar la invitación sin que el registro implique aceptación

#### Scenario: Cuenta existente
- **WHEN** el invitado ya tiene cuenta
- **THEN** inicia sesión sin crear otra identidad

#### Scenario: Edición ajena
- **WHEN** la empresa intenta modificar el perfil personal
- **THEN** se rechaza; solo puede gestionar datos autorizados de la asociación

### Requirement: Identidad verificada para aceptación
Aceptar o rechazar MUST requerir identidad autenticada con correo verificado igual al destinatario, perfil completo y enlace vigente. El enlace por sí solo MUST NOT verificar el correo. La aplicación MUST conservar el identificador estable de la cuenta como referencia.

#### Scenario: Cuenta equivocada
- **WHEN** se abre el enlace con otra cuenta o con correo no verificado
- **THEN** se impide aceptar y se indica cómo cambiar de cuenta o verificarla

#### Scenario: Prueba sin correo saliente
- **WHEN** se ejecuta una prueba local sin SMTP de Keycloak
- **THEN** se usa una cuenta verificada preparada por el operador; no existe bypass de verificación en la API

### Requirement: Aceptación explícita y atómica
La aceptación MUST mostrar organización, roles y los cuatro campos compartidos. MUST revalidar organización activa, autoridad actual del remitente y roles permitidos, y confirmar invitación, pertenencia, roles y auditoría de forma atómica.

#### Scenario: Aceptación válida
- **WHEN** el destinatario confirma una invitación elegible
- **THEN** queda aceptada y la asociación activa con sus roles

#### Scenario: Condiciones revocadas
- **WHEN** la organización se desactiva o el remitente pierde autoridad antes de aceptar
- **THEN** se rechaza la aceptación sin activar acceso

#### Scenario: Concurrencia
- **WHEN** se acepta dos veces o se compite con una cancelación
- **THEN** solo una transición válida se confirma sin duplicar pertenencia, roles ni auditoría

### Requirement: Duplicados y reenvío
MUST existir como máximo una invitación pendiente por correo normalizado y organización. Reenviar una activa MUST rotar el enlace y renovar vencimiento; modificar correo, organización o roles MUST exigir cancelación y nueva invitación. Los estados terminales MUST permanecer inmutables.

#### Scenario: Duplicado
- **WHEN** se intenta invitar de nuevo al mismo destinatario y organización con invitación activa
- **THEN** se informa la existente sin crear duplicados

#### Scenario: Reenvío
- **WHEN** se reenvía una invitación activa
- **THEN** se registra el enlace nuevo en el log y el anterior deja de funcionar

#### Scenario: Nuevo intento terminal
- **WHEN** se necesita volver a invitar tras rechazo, cancelación o vencimiento
- **THEN** se crea otro registro sin alterar el historial previo

### Requirement: Roles de usuarios ya activos
Una asociación activa MUST permitir agregar o retirar roles autorizados sin reinvitación, conservando al menos uno compatible con su organización. MUST NOT permitir editar los permisos que componen los roles ni conceder roles fuera de la facultad del actor.

#### Scenario: Cambio autorizado
- **WHEN** se modifica el conjunto de roles de un usuario activo
- **THEN** se guarda y audita sin generar otra invitación

#### Scenario: Último rol
- **WHEN** se solicita retirar el único rol
- **THEN** se rechaza y se ofrece desactivar la asociación o sustituir el rol atómicamente

#### Scenario: Cambio sin efecto
- **WHEN** se guarda el mismo conjunto de roles
- **THEN** no se crean cambios ni eventos duplicados

### Requirement: Pertenencia y suspensión
La pertenencia MUST conservar evidencia de aceptación y roles aunque se desactive; una relación inactiva MUST NOT conceder acceso. Reactivar una relación previamente aceptada MUST requerir administrador autorizado y roles vigentes. Una organización diferente MUST exigir invitación propia.

#### Scenario: Suspensión
- **WHEN** se desactiva una asociación
- **THEN** se conserva el historial y se pierde acceso operativo y consulta del perfil por esa relación

#### Scenario: Reactivación
- **WHEN** se reactiva la misma pertenencia aceptada con roles válidos
- **THEN** se recupera acceso sin inventar otra aceptación

### Requirement: Continuidad administrativa
MUST impedir retirar o desactivar al último administrador activo de una organización operativa, incluso con cambios concurrentes. La creación inicial sin administrador MUST admitir únicamente el proceso de incorporación hasta aceptar el primero.

#### Scenario: Último administrador
- **WHEN** dos operaciones intentan retirar los últimos administradores simultáneamente
- **THEN** se conserva al menos uno o se rechazan las operaciones incompatibles

### Requirement: Perfil compartido limitado
La consulta de usuarios vinculados MUST devolver solo nombre completo, tipo y número de documento y correo, además de roles y estado de la relación autorizada. MUST exigir pertenencia aceptada y activa y restringir lista, búsqueda, detalle, conteos y paginación al ámbito del actor.

#### Scenario: Antes de aceptar
- **WHEN** la empresa consulta una invitación pendiente
- **THEN** solo obtiene datos de la invitación y no el perfil de la cuenta

#### Scenario: Listado aislado
- **WHEN** un administrador consulta usuarios de su ámbito
- **THEN** no recibe perfiles ni roles en otras organizaciones

### Requirement: Autorización local vigente
Los roles organizacionales MUST proceder de asociaciones locales activas y aceptadas o migradas explícitamente. MUST conservarse APP_ADMIN global y la matriz de permisos. El backend MUST validar roles actuales por operación sin depender de roles organizacionales antiguos del token.

#### Scenario: Rol local nuevo
- **WHEN** el usuario acepta un rol que no figura en su token
- **THEN** puede ejercer únicamente los permisos locales autorizados

#### Scenario: Rol retirado con sesión abierta
- **WHEN** un usuario intenta una operación después de perder el rol necesario
- **THEN** el backend la deniega aunque la sesión siga abierta; esta fase no envía notificación de cambio ni fuerza logout

### Requirement: Trazabilidad y migración
MUST auditar creación, entrega, transiciones, roles y estado de pertenencia sin guardar enlaces secretos en auditoría. Las relaciones legadas MUST conservar procedencia explícita LEGACY y no simular aceptación de invitación; los conflictos MUST bloquear la transición hasta reconciliación.

#### Scenario: Migración repetida
- **WHEN** se ejecuta dos veces la migración sobre asociaciones existentes
- **THEN** se preservan IDs, roles, estados e historial sin duplicados ni aceptación ficticia

#### Scenario: Registro operativo existente
- **WHEN** se vincula una cuenta a un conductor existente
- **THEN** se usa una relación explícita autorizada y no una fusión automática por nombre o documento

### Requirement: Recorrido de interfaz verificable
La interfaz MUST separar Gestionar invitaciones, Mis invitaciones, Usuarios vinculados y Mi perfil. MUST mostrar estados, roles y vencimiento, y permitir iniciar la aceptación antes de tener contexto organizacional. Mis invitaciones MUST consultar por el correo verificado de la identidad autenticada, mostrar su historial y habilitar aceptar/rechazar solo invitaciones pendientes vigentes. La bandeja y sus acciones MUST funcionar sin conservar el token del enlace ni datos de sesión del navegador.

#### Scenario: Usuario sin organización
- **WHEN** una cuenta nueva abre la invitación y se autentica
- **THEN** puede abrir Mis invitaciones, encontrar el registro asociado a su correo verificado y aceptarlo antes de disponer de contexto operativo

#### Scenario: Acción de Keycloak en otro navegador
- **WHEN** el usuario completa la verificación de correo y define la contraseña desde otro navegador sin la sesión OIDC original
- **THEN** Keycloak ofrece volver al origen de la aplicación; el usuario inicia sesión, abre Mis invitaciones y confirma la invitación sin necesitar el enlace original

#### Scenario: Acceso desde navegador diferente
- **WHEN** el usuario ya autenticado abre Invoices App en otro navegador
- **THEN** Mis invitaciones consulta únicamente invitaciones asociadas al correo Keycloak verificado de esa sesión y ofrece acciones solo para las pendientes vigentes
#### Scenario: Revisión responsive
- **WHEN** se recorre el flujo a 360 y 1280 px con teclado
- **THEN** campos, acciones, mensajes de error y confirmaciones son accesibles

### Requirement: Retorno y destino después de autenticación
El Home URL de Keycloak MUST abrir `/login`, que informa que debe iniciar sesión para continuar. Tras completar el login, una identidad sin contextos organizacionales MUST ir directamente a Mis invitaciones.

#### Scenario: Retorno tras actualizar contraseña
- **WHEN** Keycloak termina de actualizar la contraseña y el usuario elige volver a Invoices App
- **THEN** se abre `/login` con el mensaje de que debe iniciar sesión para continuar

#### Scenario: Login sin organización vinculada
- **WHEN** el usuario completa el login y no tiene contextos organizacionales activos
- **THEN** la aplicación redirige directamente a Mis invitaciones

### Requirement: Registro explícito desde invitación
La invitación MUST ofrecer Ya tengo cuenta y Crear mi cuenta, abrir login/registro de Keycloak con recipientEmail como login_hint y permitir cambiar de cuenta. MUST mostrar los cuatro datos compartidos y NO aceptar automáticamente ni consultar públicamente la existencia de cuentas. La interfaz MUST mostrar Aceptar/Rechazar solo cuando el correo de la sesión autenticada coincida, normalizado sin distinguir mayúsculas, con recipientEmail; sin sesión o con otra cuenta MUST ofrecer iniciar sesión y crear cuenta sin ejecutar la aceptación. La autenticación iniciada desde una invitación MUST volver a Mis invitaciones después del callback OIDC aunque la cuenta tenga otros contextos. Tras aceptar desde el enlace o la bandeja, la aplicación MUST resolver y seleccionar el contexto de la organización asociada; si no puede activarlo, conserva la aceptación y ofrece el selector manual. Si vuelve sin token, MUST dirigir a Mis invitaciones, filtrada por el correo verificado.

#### Scenario: Registro sin cuenta previa
- **WHEN** un destinatario elige Crear mi cuenta con una invitación vigente
- **THEN** registra su identidad en Keycloak, verifica el correo, inicia sesión y confirma explícitamente la invitación desde Mis invitaciones

#### Scenario: Cambio de identidad
- **WHEN** la sesión pertenece a otra cuenta y el usuario elige Cambiar de cuenta
- **THEN** se solicita autenticación interactiva y se conserva la invitación para volver a validar al destinatario

#### Scenario: Sesión corresponde al destinatario
- **WHEN** una sesión autenticada abre una invitación y su correo coincide con recipientEmail
- **THEN** se muestran las acciones explícitas Aceptar y Rechazar

#### Scenario: Sesión corresponde a otra cuenta
- **WHEN** una sesión autenticada abre una invitación dirigida a otro correo
- **THEN** no se permite aceptar ni rechazar desde esa sesión y se ofrecen iniciar sesión o crear una cuenta con recipientEmail como login_hint

#### Scenario: Retorno después de autenticación iniciada desde invitación
- **WHEN** el destinatario inicia login o registro desde el enlace de invitación y completa OIDC
- **THEN** el callback redirige a Mis invitaciones sin guardar el secreto de invitación en almacenamiento del navegador

#### Scenario: Activar el contexto aceptado
- **WHEN** se acepta una invitación desde el enlace o Mis invitaciones
- **THEN** se resuelve y selecciona el contexto que coincide con organizationId y organizationType de la invitación; si falla la resolución, la aceptación permanece confirmada y se ofrece el selector

### Requirement: Continuidad temporal recuperable
La invitación MUST mantener vigencia predeterminada de 72 horas. El token MUST permanecer en la URL y MUST NOT depender de una copia en sessionStorage/localStorage. Una recarga o apertura del enlace original en otro navegador MUST conservar la capacidad de consultar la invitación mientras siga vigente en el servidor. La aceptación, rechazo o invalidez terminal MUST eliminar el token de la URL; una invitación vencida MUST indicar que se solicite una nueva.

#### Scenario: Registro mayor de diez minutos
- **WHEN** el registro tarda 20 minutos y después de autenticarse el enlace ya no está en la URL
- **THEN** la bandeja autenticada recupera la invitación si todavía está vigente sin depender de almacenamiento del navegador
- **THEN** el usuario confirma la invitación explícitamente y la vigencia original del servidor se mantiene

#### Scenario: Invitación cercana al vencimiento
- **WHEN** faltan cinco minutos para vencer la invitación al iniciar login
- **THEN** el servidor conserva el vencimiento original y una nueva consulta del enlace respeta como máximo esos cinco minutos
- **THEN** el contexto temporal vence como máximo en cinco minutos y no amplía la vigencia del servidor

#### Scenario: Recarga o fallo de red
- **WHEN** se recarga la aceptación o falla una consulta antes del vencimiento
- **THEN** se vuelve a consultar la misma invitación usando el token que permanece en la URL y se permite reintentar
- **THEN** se recupera el mismo contexto con su plazo original y se permite reintentar

#### Scenario: Continuidad vencida
- **WHEN** se abre la pantalla sin token en la URL o la invitación ya venció
- **THEN** se ofrece Mis invitaciones para revisar su estado; si venció, se conserva en el historial sin acciones y se indica solicitar una nueva
- **THEN** una cuenta ya creada permanece disponible para iniciar sesión y revisar el historial de invitaciones asociado a su correo verificado

### Requirement: Recuperación de identidad accionable
La aceptación autenticada MUST distinguir correo no coincidente, correo sin verificar y perfil incompleto con códigos y mensajes específicos. MUST mantener la invitación para corregir esas condiciones y no exponer datos ajenos. La verificación de correo MUST tener un plazo configurado de 60 minutos sin ampliar tokens de acceso ni sesiones SSO.

#### Scenario: Perfil incompleto
- **WHEN** la cuenta destinataria verificada carece de documento completo
- **THEN** se informa PROFILE_INCOMPLETE sin atribuir el fallo a un correo diferente ni crear asociación

#### Scenario: Correo pendiente de verificar
- **WHEN** la identidad destinataria no tiene correo verificado
- **THEN** se informa EMAIL_UNVERIFIED y se conserva la invitación para reintentar después de verificar

### Requirement: Elegibilidad vigente del tercero remitente y destinatario

Las operaciones de invitación y membresía para un tercero MUST revalidar que el tercero esté activo y, cuando intervenga una empresa, que la relación empresa-tercero siga activa. La creación, reenvío, aceptación, rechazo, cambio de roles y reactivación MUST preservar el historial, pero MUST rechazar transiciones que creen o restauren acceso sobre un tercero o relación inactivos.

#### Scenario: Relación revocada antes de aceptar

- **WHEN** una invitación pendiente para un tercero se acepta después de que su relación con la empresa remitente fue desactivada
- **THEN** la aceptación se rechaza sin crear membresía ni acceso y la invitación conserva su historial

#### Scenario: Tercero reactivado con membresía suspendida

- **WHEN** se reactiva un tercero cuya asociación de usuario fue suspendida previamente
- **THEN** la asociación permanece suspendida hasta una reactivación autorizada y explícita

#### Scenario: Historial de una relación inactiva

- **WHEN** un administrador autorizado consulta invitaciones o membresías históricas de un tercero relacionado anteriormente
- **THEN** puede ver los registros permitidos sin obtener acciones que restauren acceso mientras la relación siga inactiva
