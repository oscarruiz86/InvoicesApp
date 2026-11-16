# Backend Runtime

## Purpose

Proporcionar una API técnica independiente con salud observable, documentación verificable y límites de infraestructura preparados, sin implementar operaciones de negocio ni autenticación funcional.

## ADDED Requirements

### Requirement: API independiente sin páginas de producto
El backend MUST exponer servicios técnicos HTTP y documentación de API sin servir páginas de producto, login ni operaciones de negocio. Los puntos de entrada HTTP MUST permanecer separados de configuración, conexión de datos y futuras reglas de negocio.

#### Scenario: Inventario inicial de rutas
- **WHEN** se inspeccionan las rutas y el build del backend
- **THEN** están disponibles salud, contrato y documentación técnica, sin páginas de la WebApp ni endpoints de negocio
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
`GET /api/openapi` MUST publicar un documento OpenAPI 3.1.0 válido con salud y errores técnicos. `GET /api/docs` MUST ofrecer Swagger con assets locales y ese mismo contrato, sin depender de una CDN ni de páginas de producto.

#### Scenario: Consulta del contrato
- **WHEN** se solicita `/api/openapi`
- **THEN** responde HTTP 200 y JSON con `openapi: "3.1.0"`, el esquema de salud y sus respuestas documentadas
- **AND** el resultado real del endpoint cumple ese contrato

#### Scenario: Documentación sin CDN
- **WHEN** se abre `/api/docs` con acceso únicamente al backend local
- **THEN** Swagger carga sus assets, muestra el contrato y permite consultar health sin requerir login

### Requirement: Integración de identidad preparada e inactiva
La preparación de identidad MUST separar el contrato interno de la configuración específica del proveedor. Su ausencia MUST permitir arrancar servicios técnicos públicos; suministrarla MUST NOT activar login, verificar tokens ni simular identidades.

#### Scenario: Keycloak sin configurar
- **WHEN** se inicia el backend sin variables Keycloak
- **THEN** los servicios técnicos pueden operar y no se inicia un flujo de autenticación

#### Scenario: Configuración Keycloak parcial
- **WHEN** se proporciona issuer sin audiencia o audiencia sin issuer
- **THEN** se rechaza la configuración incompleta conforme al contrato de entorno inválido

#### Scenario: Configuración completa sin implementación de login
- **WHEN** se proporcionan issuer y audiencia válidos
- **THEN** se conserva el punto de configuración preparado sin crear sesiones, aceptar tokens ficticios ni exponer endpoints de login

### Requirement: Errores técnicos HTTP coherentes
Los errores controlados MUST usar un envelope con `error.code` y `error.message`. Los fallos inesperados MUST devolver HTTP 500 con código `INTERNAL_ERROR`, sin filtrar stacks, URI, credenciales ni información del proveedor.

#### Scenario: Fallo inesperado en un controlador
- **WHEN** un controlador técnico lanza un error inesperado durante una prueba
- **THEN** la respuesta contiene el error público documentado y no el mensaje interno o stack original
