# Backend Runtime — Spec Delta

## MODIFIED Requirements

### Requirement: API independiente sin páginas de producto
El backend MUST exponer servicios técnicos HTTP, documentación y `GET /api/auth/me` protegido, sin servir páginas de producto, login propio ni operaciones de negocio. Los puntos de entrada HTTP MUST permanecer separados de configuración, autenticación, conexión de datos y reglas de aplicación.

#### Scenario: Inventario inicial de rutas
- **WHEN** se inspeccionan las rutas y el build del backend
- **THEN** están disponibles salud, contrato, documentación técnica y consulta de identidad, sin páginas de la WebApp ni endpoints de negocio
- **AND** los handlers no acceden directamente a modelos de persistencia

### Requirement: Contrato OpenAPI 3.1 y Swagger accesibles
`GET /api/openapi` MUST publicar OpenAPI 3.1.0 válido con salud, `/api/auth/me` y errores documentados. `GET /api/docs` MUST ofrecer Swagger con assets locales y ese mismo contrato. Salud y documentación MUST permanecer públicas; solo las operaciones protegidas MUST declarar seguridad Bearer JWT.

#### Scenario: Consulta del contrato
- **WHEN** se solicita `/api/openapi`
- **THEN** responde 200 con `openapi: "3.1.0"`, esquema de salud y contrato de `/api/auth/me`
- **AND** los resultados reales cumplen los contratos documentados

#### Scenario: Documentación sin CDN
- **WHEN** se abre `/api/docs` con acceso únicamente al backend local
- **THEN** Swagger carga assets locales, muestra el contrato y permite consultar health sin requerir login

#### Scenario: Seguridad y respuestas de identidad
- **WHEN** se inspecciona `GET /api/auth/me` en OpenAPI
- **THEN** declara un esquema HTTP Bearer con formato JWT y respuestas 200 y 401 con DTO, envelope y headers reales
- **AND** documenta además 503 `CONFIGURATION_ERROR` y 500 `INTERNAL_ERROR`, sin ejemplos con tokens reales

#### Scenario: Pruebas autenticadas en Swagger
- **WHEN** en desarrollo se ingresa un Access Token válido en Authorize y se ejecuta `/api/auth/me`
- **THEN** Swagger envía Bearer y muestra 200 con el perfil
- **AND** al retirar el token muestra 401, funciona por acceso directo y por proxy y no persiste autorización al recargar

### Requirement: Integración de identidad preparada e inactiva
La integración MUST separar contrato interno y configuración del proveedor; pasa de preparación inactiva a verificación real cuando se configura completamente. Sin Keycloak MUST permitir servicios técnicos públicos y rechazar operaciones protegidas con 503 `CONFIGURATION_ERROR`. MUST NOT crear sesiones backend ni aceptar identidades ficticias.

#### Scenario: Keycloak sin configurar
- **WHEN** se inicia el backend sin variables Keycloak
- **THEN** los servicios técnicos públicos pueden operar sin iniciar autenticación
- **AND** `/api/auth/me` responde 503 sin conceder acceso

#### Scenario: Configuración Keycloak parcial
- **WHEN** se proporciona issuer sin audiencia, audiencia sin issuer o JWKS sin el par requerido
- **THEN** se rechaza la configuración incompleta conforme al contrato de entorno inválido

#### Scenario: Configuración completa sin implementación de login
- **WHEN** se proporcionan issuer, audiencia y configuración JWKS válidos
- **THEN** las rutas protegidas verifican tokens mediante un adaptador real al recibir solicitudes
- **AND** salud y build no consultan Keycloak, no se exponen endpoints de login ni se crean sesiones backend

## ADDED Requirements

### Requirement: Separación entre errores de autenticación y runtime
Con configuración válida, credenciales ausentes o no verificables MUST producir 401 `UNAUTHENTICATED`. Una configuración ausente para rutas privadas, parcial o inválida MUST producir 503 `CONFIGURATION_ERROR`; un fallo inesperado MUST producir 500 `INTERNAL_ERROR`. Todos MUST usar el envelope común y omitir tokens, valores sensibles, stacks y detalles del proveedor.

#### Scenario: Precedencia de configuración
- **WHEN** se invoca `/api/auth/me` sin token y el servicio no tiene configuración de identidad válida
- **THEN** se devuelve 503 porque el servicio no puede evaluar autenticación
- **AND** tras configurar correctamente, la misma solicitud sin token devuelve 401

#### Scenario: Fallo operativo de JWKS
- **WHEN** la configuración es válida pero no se puede verificar la credencial por falta de claves disponibles
- **THEN** se devuelve 401 neutro y el diagnóstico interno distingue la indisponibilidad sin registrar la credencial
