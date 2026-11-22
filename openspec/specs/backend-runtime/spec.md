# backend-runtime Specification

## Purpose

Proporcionar una API independiente con salud observable, documentación verificable e identidad autenticada, sin implementar operaciones de negocio.

## Requirements

### Requirement: API independiente sin páginas de producto
El backend MUST exponer servicios técnicos HTTP, documentación y `GET /api/auth/me` protegido, sin servir páginas de producto, login propio ni operaciones de negocio. Los puntos de entrada HTTP MUST permanecer separados de configuración, autenticación, conexión de datos y reglas de aplicación.

#### Scenario: Inventario inicial de rutas
- **WHEN** se inspeccionan las rutas y el build del backend
- **THEN** están disponibles salud, contrato, documentación técnica y consulta de identidad, sin páginas de la WebApp ni endpoints de negocio
- **AND** los handlers no acceden directamente a modelos de persistencia

### Requirement: Comprobación de vida independiente de servicios externos
Con configuración válida, `GET /api/health` MUST devolver HTTP 200, JSON con `status` igual a `ok` y `Cache-Control: no-store`. MUST expresar vida del proceso sin abrir conexiones MongoDB ni solicitar validación Keycloak.

#### Scenario: Backend operativo
- **WHEN** se consulta `/api/health` con configuración válida
- **THEN** responde HTTP 200 con el cuerpo y cabeceras documentados, sin necesitar credenciales de usuario

#### Scenario: MongoDB o Keycloak no disponibles
- **WHEN** el proceso está activo con configuración válida y los servicios externos no están disponibles
- **THEN** `/api/health` sigue respondiendo HTTP 200 sin afirmar disponibilidad de persistencia ni autenticación

### Requirement: Entorno de runtime validado y privado
El backend MUST validar variables requeridas y formato de las opcionales antes de atender sus servicios técnicos. Una configuración inválida MUST producir un error HTTP 503 neutro con código `CONFIGURATION_ERROR`, sin revelar valores sensibles. La compilación MUST NOT requerir conexiones o credenciales reales.

#### Scenario: Configuración inválida
- **WHEN** falta la URI requerida o una variable tiene formato inválido en runtime
- **THEN** el servicio no afirma estado operativo y responde HTTP 503 con el envelope documentado
- **AND** el diagnóstico identifica variables problemáticas sin mostrar sus valores

#### Scenario: Build aislado de servicios
- **WHEN** se compila con las dependencias instaladas y sin MongoDB o Keycloak activos
- **THEN** el build puede completarse sin conexiones ni credenciales externas

### Requirement: Conexión de datos perezosa y reutilizable
La infraestructura de datos MUST abrir una conexión solo cuando se solicita explícitamente y reutilizar el pool y el intento en curso por proceso. MUST usar tiempos de espera finitos y permitir nuevos intentos después de un fallo, sin cerrar el pool por solicitud.

#### Scenario: Solicitudes concurrentes de conexión
- **WHEN** varias operaciones técnicas solicitan conexión dentro del mismo proceso
- **THEN** comparten un intento en curso y reutilizan el pool resultante

#### Scenario: Recuperación de intento fallido
- **WHEN** una conexión falla y después se recupera MongoDB
- **THEN** una solicitud posterior puede abrir conexión sin quedar bloqueada permanentemente por la promesa rechazada

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

### Requirement: Errores técnicos HTTP coherentes
Los errores controlados MUST usar un envelope con `error.code` y `error.message`. Los fallos inesperados MUST devolver HTTP 500 con código `INTERNAL_ERROR`, sin filtrar stacks, URI, credenciales ni información del proveedor.

#### Scenario: Fallo inesperado en un controlador
- **WHEN** un controlador técnico lanza un error inesperado durante una prueba
- **THEN** la respuesta contiene el error público documentado y no el mensaje interno o stack original

### Requirement: Separación entre errores de autenticación y runtime
Con configuración válida, credenciales ausentes o no verificables MUST producir 401 `UNAUTHENTICATED`. Una configuración ausente para rutas privadas, parcial o inválida MUST producir 503 `CONFIGURATION_ERROR`; un fallo inesperado MUST producir 500 `INTERNAL_ERROR`. Todos MUST usar el envelope común y omitir tokens, valores sensibles, stacks y detalles del proveedor.

#### Scenario: Precedencia de configuración
- **WHEN** se invoca `/api/auth/me` sin token y el servicio no tiene configuración de identidad válida
- **THEN** se devuelve 503 porque el servicio no puede evaluar autenticación
- **AND** tras configurar correctamente, la misma solicitud sin token devuelve 401

#### Scenario: Fallo operativo de JWKS
- **WHEN** la configuración es válida pero no se puede verificar la credencial por falta de claves disponibles
- **THEN** se devuelve 401 neutro y el diagnóstico interno distingue la indisponibilidad sin registrar la credencial
