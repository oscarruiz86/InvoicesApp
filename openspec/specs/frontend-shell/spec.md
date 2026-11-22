# frontend-shell Specification

## Purpose

Ofrecer una aplicación web provisional navegable y responsive que permita verificar la base de presentación y su comunicación con la API antes de desarrollar módulos de negocio.

## Requirements

### Requirement: Shell provisional navegable y responsive
La WebApp MUST mostrar una pantalla inicial identificada como Invoices App, con layout adaptable y tema global consistente. MUST ofrecer una vista de ruta no encontrada sin presentar funcionalidades de negocio aún no implementadas.

#### Scenario: Pantalla inicial en móvil y escritorio
- **WHEN** se abre `/` en anchos de 360 px y 1280 px
- **THEN** se muestran cabecera y contenido provisional legibles con el mismo tema global
- **AND** no hay desplazamiento horizontal causado por el layout

#### Scenario: Ruta desconocida y recarga
- **WHEN** se accede o recarga una ruta no definida de la WebApp
- **THEN** la aplicación muestra su vista de ruta no encontrada dentro del layout, sin invocar una página de producto del backend

### Requirement: Estado observable de comunicación con API
La pantalla provisional MUST consultar la salud de la API y distinguir carga, disponibilidad y error. Tras un fallo MUST permitir un reintento explícito sin requerir recargar toda la aplicación.

#### Scenario: API disponible
- **WHEN** la consulta de salud está pendiente y luego devuelve el resultado válido esperado
- **THEN** la UI pasa de carga a API disponible

#### Scenario: API no disponible y recuperación
- **WHEN** falla una consulta y el usuario reintenta después de recuperar la API
- **THEN** la UI muestra primero un error comprensible, vuelve a carga durante el reintento y finalmente muestra disponibilidad

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

### Requirement: Comunicación desacoplada y cancelable
La presentación MUST acceder a la API mediante casos de uso y contratos sustituibles. La comunicación externa MUST contar con tiempo de espera finito y cancelación, sin persistencia ni llamadas HTTP directas desde componentes visuales.

#### Scenario: Sustitución del adaptador
- **WHEN** se prueba el caso de uso con un puerto de salud de prueba
- **THEN** se verifican éxito y fallo sin servidor HTTP ni cambios en las reglas del caso de uso

#### Scenario: Solicitud que no termina
- **WHEN** una solicitud excede su tiempo de espera o se cancela
- **THEN** deja de permanecer indefinidamente en carga y el flujo distingue el resultado correspondiente

### Requirement: Gestión centralizada de errores y estado de interfaz
Los errores de red, timeout, HTTP y respuesta inválida MUST traducirse a categorías y mensajes consistentes. Los errores de render MUST mostrar una alternativa controlada. El estado centralizado de UI MUST NOT convertirse en autoridad de permisos o reglas de negocio.

#### Scenario: Error HTTP con cuerpo no JSON
- **WHEN** la API o su proxy devuelve un error con un cuerpo de texto o HTML
- **THEN** la UI presenta un error consistente sin fallar al interpretar el cuerpo ni mostrar información técnica sensible

#### Scenario: Respuesta exitosa malformada
- **WHEN** la consulta recibe HTTP 200 con un cuerpo que no cumple el contrato de salud
- **THEN** la UI muestra un error de respuesta inválida y no afirma que la API esté disponible

#### Scenario: Error de render
- **WHEN** ocurre un fallo de render dentro de la superficie protegida por el límite de errores
- **THEN** se muestra una vista de recuperación controlada en lugar de una pantalla vacía

### Requirement: La autenticación conserva la ruta protegida actual

Cuando una ruta protegida requiere autenticación, el sistema MUST conservar su ruta relativa, query y fragmento por la duración del callback OIDC y MUST volver a esa ubicación después del inicio de sesión. El destino MUST ser de mismo origen y MUST NOT ser el callback de autenticación.

#### Scenario: Retorno a una ruta protegida
- **WHEN** una persona recarga `/parameters?page=2#history` sin sesión y completa el inicio de sesión
- **THEN** vuelve a `/parameters?page=2#history`

#### Scenario: Destino no confiable
- **WHEN** el destino guardado es externo, malformado o apunta al callback OIDC
- **THEN** la aplicación usa `/session` como destino seguro

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
