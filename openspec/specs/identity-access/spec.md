# identity-access Specification

## Purpose

Autenticar usuarios con un proveedor OIDC externo y entregar una identidad verificada a la aplicación, separando credenciales, roles generales y futura autorización organizacional.

## Requirements

### Requirement: Registro y perfil para invitaciones
El registro autónomo y el perfil propio MUST residir en Keycloak conforme a `implement-user-invitations`. MUST incluir nombre completo, correo, tipo y número documental colombiano; el correo MUST ser no editable en el perfil normal. La aceptación MUST exigir correo actual verificado y perfil completo por puerto de Identity.

#### Scenario: Retorno de invitación sin contexto
- **WHEN** el destinatario se registra o inicia sesión desde una invitación
- **THEN** vuelve a revisarla sin requerir contexto operativo y sin aceptar ni verificar correo automáticamente

#### Scenario: Identidad informativa y autorización local
- **WHEN** se consulta `/api/auth/me` y luego se solicita una operación organizacional
- **THEN** `/me` representa los claims básicos del token; el perfil compartido se lee del proveedor y los roles locales de memberships activas, sin autorizar por roles organizacionales del token
- **AND** APP_ADMIN conserva su fuente global verificada

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
El realm MUST definir `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`. El backend MUST mapear únicamente esos roles desde claims verificados y ofrecer una política reutilizable por roles, sin asignación privilegiada por defecto, jerarquías implícitas ni acceso organizacional derivado solo del rol.

#### Scenario: Roles manipulados o desconocidos
- **WHEN** el cliente declara roles en headers, query o cuerpo, o el token contiene otros roles
- **THEN** esos valores no conceden permisos y los roles desconocidos no aparecen en `/api/auth/me`

#### Scenario: Política de roles preparada
- **WHEN** se prueba una operación protegida de prueba que exige un rol ausente en el actor válido
- **THEN** la política deniega con categoría de autorización traducible a 403, sin crear endpoints de negocio
- **AND** `/api/auth/me` continúa disponible para cualquier actor autenticado

### Requirement: Integración de sesión verificable de extremo a extremo
La integración MUST demostrar con Keycloak real que una visita anónima a una ruta privada inicia OIDC, regresa autenticada, envía un Access Token al backend y muestra la identidad devuelta por `/api/auth/me`. MUST verificar también rechazo backend sin depender de controles visuales.

#### Scenario: Recorrido completo
- **WHEN** el usuario abre la WebApp, entra a `/session` y se autentica en Keycloak
- **THEN** vuelve mediante `/auth/callback`, se establece la sesión OIDC y se consulta `/api/auth/me` con Bearer
- **AND** el backend verifica firma con claves de Keycloak y los claims requeridos, devuelve 200 y la UI muestra la sesión activa

#### Scenario: Acceso directo fuera de la UI
- **WHEN** un cliente HTTP invoca `/api/auth/me` sin token válido
- **THEN** recibe 401 aunque se omita toda la lógica del frontend
