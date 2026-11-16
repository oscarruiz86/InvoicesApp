# Frontend Shell — Spec Delta

## MODIFIED Requirements

### Requirement: Configuración pública validada
El frontend MUST validar su base de API y el grupo OIDC antes de iniciar su comunicación correspondiente. La configuración del navegador MUST contener únicamente valores públicos. Sin OIDC MUST conservar el shell público e indicar autenticación no configurada al intentar usarla; un grupo parcial o inválido MUST bloquear el flujo OIDC, sin URI MongoDB, secretos ni configuración privada del backend.

#### Scenario: Base de API inválida
- **WHEN** la base configurada no cumple el formato admitido
- **THEN** la aplicación informa un problema de configuración sin realizar solicitudes a un destino indeterminado

#### Scenario: Inspección del bundle público
- **WHEN** se inspeccionan los assets generados con la configuración de ejemplo
- **THEN** no contienen URI MongoDB, secretos ni direcciones internas de Docker destinadas al servidor

#### Scenario: OIDC ausente o incompleto
- **WHEN** no se configura OIDC o solo se proporciona parte del grupo requerido
- **THEN** no se inventa una sesión ni se redirige a una URL indeterminada
- **AND** intentar acceder a autenticación muestra un error de configuración comprensible

## ADDED Requirements

### Requirement: Login y callback OIDC seguros
La WebApp MUST delegar login en Keycloak mediante Authorization Code Flow con PKCE S256, correlación state y nonce. MUST procesar el callback antes de renderizar contenido privado, limpiar los parámetros OIDC de la URL y rechazar respuestas sin correlación válida. MUST conservar solo un destino de retorno relativo permitido del mismo origen.

#### Scenario: Login explícito
- **WHEN** el usuario selecciona iniciar sesión desde `/`
- **THEN** es enviado a Keycloak y, tras autenticarse, vuelve por `/auth/callback` hacia `/session`

#### Scenario: Callback inválido o cancelado
- **WHEN** el callback no corresponde al flujo iniciado o Keycloak devuelve cancelación o error
- **THEN** la UI muestra un error recuperable sin exponer tokens ni detalles internos y no habilita contenido privado
- **AND** no entra en un bucle automático de redirección

#### Scenario: Retorno externo manipulado
- **WHEN** se proporciona un destino absoluto, de otro origen o no permitido
- **THEN** la aplicación ignora ese destino y usa `/session`

### Requirement: Navegación privada con inicialización controlada
La WebApp MUST conservar `/` y la vista de ruta desconocida públicas y añadir `/session` como ruta privada de verificación. MUST esperar la inicialización de autenticación antes de decidir acceso y redirigir al visitante anónimo a Keycloak una sola vez por intento. Una recarga MUST recuperar la sesión mediante OIDC, sin restaurar tokens persistidos.

#### Scenario: Visita directa a ruta privada
- **WHEN** un visitante sin sesión abre `/session`
- **THEN** ve carga durante inicialización y luego es redirigido a Keycloak sin ver contenido privado
- **AND** después del callback válido retorna a `/session`

#### Scenario: Recarga con sesión SSO
- **WHEN** se recarga `/session` y Keycloak conserva una sesión activa
- **THEN** se realiza un nuevo flujo OIDC y se recupera acceso sin depender de cookies de terceros o de tokens guardados por la WebApp

### Requirement: Estado observable de autenticación
La UI MUST distinguir inicialización, anónimo, autenticación en curso, autenticado, renovación, cierre y error. MUST mantener usuario y estado centralizados mediante Zustand sin convertirlos en autoridad de permisos. `/session` MUST mostrar carga, error o los datos confirmados por `/api/auth/me`, sin afirmar sesión API activa antes de recibir un 200 válido.

#### Scenario: Sesión confirmada por backend
- **WHEN** el callback termina y `/api/auth/me` devuelve una respuesta válida
- **THEN** se muestra sesión activa y la información básica del usuario, con acción de cierre

#### Scenario: API no disponible o perfil inválido
- **WHEN** `/api/auth/me` falla por red, timeout, 503 o cuerpo inválido
- **THEN** la UI muestra un error distinguible de credenciales inválidas y permite reintentar
- **AND** no afirma que la sesión API esté activa ni redirige automáticamente por un error de red

### Requirement: Credenciales únicamente en memoria
La WebApp MUST mantener Access Token, Refresh Token e ID Token solo en memoria del adaptador de autenticación. MUST NOT persistirlos en localStorage, sessionStorage, IndexedDB, cookies propias, estado Zustand persistido o logs. Los datos transitorios necesarios para correlación OIDC MUST ser de uso único, expirar y eliminarse al finalizar.

#### Scenario: Inspección de almacenamiento y registros
- **WHEN** se completa login, renovación y logout
- **THEN** no se encuentran tokens en almacenamiento persistente, estado serializado de UI ni registros
- **AND** los parámetros de respuesta OIDC desaparecen de la URL tras procesarlos

### Requirement: Renovación acotada y concurrente
La WebApp MUST renovar antes de usar un Access Token con menos de 30 segundos de vigencia y al detectar expiración, compartiendo una única renovación en curso. Si falla la renovación, MUST limpiar credenciales y perfil, impedir nuevas solicitudes protegidas y ofrecer volver a iniciar sesión. MUST descartar resultados tardíos tras logout.

#### Scenario: Peticiones concurrentes cerca de expiración
- **WHEN** varias solicitudes protegidas necesitan renovar simultáneamente
- **THEN** esperan una sola renovación y usan el token actualizado sin enviar el vencido

#### Scenario: Refresh rechazado o proveedor caído
- **WHEN** Keycloak rechaza el Refresh Token o no responde dentro del límite de espera
- **THEN** la UI abandona la sesión local y muestra recuperación explícita sin ciclos de reintento

#### Scenario: Logout durante renovación
- **WHEN** termina una renovación iniciada antes de cerrar sesión
- **THEN** su resultado no restaura usuario ni tokens

### Requirement: Transporte protegido limitado a la API
Las solicitudes protegidas MUST adjuntar `Authorization: Bearer <access_token>` solo a la base API configurada mediante un adaptador. MUST conservar timeout y cancelación, no incluir tokens en consultas públicas y no reenviarlos a otros orígenes. Ante 401 MUST invalidar la sesión local y ofrecer login, sin reintentar indefinidamente.

#### Scenario: Consulta protegida y consulta pública
- **WHEN** se consulta `/api/auth/me` y `/api/health`
- **THEN** solo la primera lleva Bearer y la segunda conserva su funcionamiento público

#### Scenario: Backend rechaza credencial
- **WHEN** `/api/auth/me` devuelve 401 aunque la UI creía estar autenticada
- **THEN** la UI elimina el perfil activo y las credenciales, y solicita un nuevo inicio de sesión explícito

#### Scenario: Destino fuera del límite permitido
- **WHEN** una solicitud protegida intenta usar otra base u obtiene una redirección HTTP
- **THEN** no se envía ni reenvía el Bearer a ese destino

### Requirement: Cierre local y cierre SSO
El logout MUST impedir inmediatamente el uso local de credenciales y eliminar perfil y estado privado, e iniciar cierre de sesión en Keycloak con retorno público permitido. Si el proveedor falla, MUST mantener la sesión local cerrada e informar que el cierre remoto no se confirmó. MUST NOT prometer revocación instantánea de JWT ya emitidos.

#### Scenario: Logout completo
- **WHEN** el usuario cierra sesión y Keycloak confirma el cierre
- **THEN** vuelve a `/`, desaparece la identidad y una nueva visita privada requiere autenticación

#### Scenario: Proveedor no confirma cierre
- **WHEN** no puede completarse la navegación o confirmación de logout remoto
- **THEN** no se reutilizan tokens locales y se informa del posible estado SSO pendiente
