# Spec Delta

## Purpose

Define condiciones verificables para ejecutar y operar Invoices App de forma segura y recuperable en producción, sin acoplar los requisitos a un proveedor de infraestructura específico.

## ADDED Requirements

### Requirement: Perfil de producción separado del entorno local
La solución MUST ofrecer una configuración de producción independiente de la configuración local, que ejecute artefactos de producción y no habilite servidores de desarrollo, datos de prueba ni servicios auxiliares exclusivos de desarrollo.

#### Scenario: Inspección del perfil productivo
- **WHEN** se valida la configuración destinada a producción
- **THEN** frontend y backend ejecutan sus artefactos de producción y MongoDB y Keycloak no usan modos de desarrollo
- **AND** la configuración local de desarrollo sigue siendo ejecutable por separado

### Requirement: Imágenes productivas versionadas en Docker Hub
El flujo de liberación MUST publicar imágenes frontend y backend públicas en Docker Hub desde cambios aprobados en `main`, con tags inmutables asociados al commit y sin credenciales ni secretos de runtime en capas, argumentos o configuración compilada.

#### Scenario: Publicación de una versión aprobada
- **WHEN** CI y las verificaciones de calidad pasan para un commit integrado en `main`
- **THEN** las imágenes de frontend y backend se publican con un tag identificable por commit
- **AND** el workflow no publica imágenes desde pull requests y no depende del tag mutable `latest`

#### Scenario: Revisión de imagen publicada
- **WHEN** se inspeccionan las imágenes de una versión
- **THEN** solo contienen artefactos runtime y configuración pública necesaria
- **AND** no contienen secretos, credenciales de MongoDB/Keycloak ni archivos `.env`

### Requirement: Actualización inicial manual en TrueNAS
La primera operación de producción MUST instalar frontend, API y workers como Custom App/YAML en TrueNAS SCALE 25.10.2.1 y requerir una actualización manual del tag de imagen tras revisar la liberación, sin desplegar credenciales administrativas de TrueNAS en GitHub Actions.

#### Scenario: Actualización revisada por operador
- **WHEN** una versión aprobada se publica en Docker Hub
- **THEN** un operador actualiza los tags de las imágenes en la Custom App de TrueNAS y verifica estado y rutas
- **AND** GitHub Actions no llama a la API de TrueNAS ni inicia una conexión administrativa hacia el NAS

### Requirement: MongoDB aislado y preparado para transacciones
La configuración productiva MUST mantener MongoDB accesible solo por la red privada de la aplicación, exigir autenticación con una cuenta de mínimo privilegio para una base exclusiva de Invoices App y habilitar el modo replica set requerido por las operaciones transaccionales.

#### Scenario: Conexión de la aplicación a MongoDB
- **WHEN** el backend de producción se conecta a MongoDB
- **THEN** usa una credencial suministrada por archivo y una URI con configuración de replica set validada
- **AND** MongoDB no tiene puerto publicado a Internet ni acceso anónimo

#### Scenario: Preparación o cambio de configuración MongoDB
- **WHEN** se habilitan autenticación o replica set en el servidor MongoDB existente
- **THEN** se verifica un respaldo recuperable y la continuidad de la conexión de la aplicación
- **AND** el procedimiento advierte que un replica set en un solo host no proporciona alta disponibilidad

### Requirement: Integración privada con el borde y Keycloak existentes
La publicación MUST conservar `invoice.oarg.casa` como origen público a través de Cloudflare Tunnel y Traefik, usar el frontend como único destino público, y preservar `https://auth.oarg.casa/realms/invoices` como issuer público de Keycloak.

#### Scenario: Acceso público a Invoices App
- **WHEN** un usuario navega a `https://invoice.oarg.casa`
- **THEN** Cloudflare Tunnel enruta a Traefik y Traefik entrega el frontend
- **AND** `/api` se reenvía al backend sin exponer MongoDB ni el puerto del backend

#### Scenario: Validación de identidad desde la red privada
- **WHEN** el navegador inicia sesión con Keycloak y el backend valida el token
- **THEN** el navegador usa el issuer público de `auth.oarg.casa` y el realm `invoices`
- **AND** el backend puede resolver las claves desde una dirección privada sin cambiar el issuer esperado

### Requirement: Exposición de red limitada
La solución MUST exponer al exterior solo los puntos de entrada de aplicación aprobados, mantener MongoDB y las interfaces administrativas de Keycloak en redes privadas, y servir el acceso de usuarios mediante HTTPS.

#### Scenario: Revisión de redes y puertos
- **WHEN** se inspeccionan servicios, redes y puertos del perfil productivo
- **THEN** únicamente los puntos de entrada aprobados son accesibles desde la red externa
- **AND** MongoDB y la administración de Keycloak no tienen puertos públicos

#### Scenario: Acceso de usuario por transporte seguro
- **WHEN** un usuario accede a la aplicación en producción
- **THEN** el origen público usa HTTPS y las llamadas a la API conservan el mismo origen seguro o un destino HTTPS aprobado

### Requirement: Contenedores de aplicación con privilegios mínimos
Los contenedores de frontend, backend y workers MUST ejecutarse sin privilegios de root, descartar capacidades Linux, impedir la escalada de privilegios y usar un sistema raíz de solo lectura, con límites explícitos de CPU, memoria y procesos.

#### Scenario: Inspección de controles de contenedor
- **WHEN** se valida la configuración de runtime de los contenedores de aplicación
- **THEN** se comprueban usuario no privilegiado, capacidades descartadas, escalada deshabilitada, filesystem raíz de solo lectura y límites de recursos
- **AND** cada ruta que requiera escritura está declarada como volumen o filesystem temporal con alcance mínimo

### Requirement: Respuestas web con cabeceras de seguridad
El punto de entrada web de producción MUST emitir cabeceras que reduzcan la ejecución de contenido no confiable, la interpretación MIME incorrecta, la incrustación no autorizada y la exposición innecesaria de información de navegación.

#### Scenario: Verificación de cabeceras web productivas
- **WHEN** se consulta la WebApp a través de su punto de entrada productivo
- **THEN** las respuestas incluyen políticas compatibles con la aplicación para CSP, protección contra MIME sniffing, control de framing y referrer
- **AND** la configuración no relaja esas políticas para habilitar recursos de terceros no aprobados

### Requirement: Readiness separada de liveness
La API MUST conservar `GET /api/health` como comprobación de vida del proceso y ofrecer una señal de readiness separada que refleje las dependencias requeridas para atender operaciones productivas, sin revelar configuración ni detalles sensibles.

#### Scenario: Proceso activo con dependencia no disponible
- **WHEN** la API está activa pero una dependencia requerida para operar no está disponible
- **THEN** `GET /api/health` conserva su contrato de liveness
- **AND** la señal de readiness indica no preparado con HTTP 503 y una respuesta neutra

#### Scenario: Dependencias requeridas disponibles
- **WHEN** la configuración de producción es válida y las dependencias requeridas están disponibles
- **THEN** la señal de readiness responde HTTP 200
- **AND** su respuesta no contiene credenciales, URI, rutas internas ni datos de usuario

### Requirement: Operación y recuperación verificables
La documentación operativa MUST definir verificaciones de liberación, observación de fallos, respaldo y restauración coherente de datos persistentes, y rollback de una versión, con criterios para mantener o reabrir escrituras.

#### Scenario: Recuperación desde respaldo
- **WHEN** un operador ejecuta el procedimiento documentado de restauración en un entorno aislado
- **THEN** puede verificar la consistencia de los datos persistentes antes de reabrir escrituras
- **AND** el procedimiento identifica los controles posteriores a la restauración

#### Scenario: Rollback de liberación
- **WHEN** una verificación posterior a la liberación falla
- **THEN** el operador puede seguir pasos documentados para volver a la versión previa compatible y comprobar el estado del servicio
