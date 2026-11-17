# Spec Delta: Backend Runtime

## ADDED Requirements

### Requirement: Secretos de Mongo e identidad desde archivos

El backend MUST leer la URI Mongo autenticada y el secreto cliente de Keycloak desde archivos montados de solo lectura. MUST NOT persistirlos ni registrarlos. Una URI Mongo inline solo se permite en desarrollo sin credenciales. Los secretos pueden permanecer en memoria mientras una conexión u operación los necesite.

#### Scenario: Conexión Mongo productiva desde archivo

- **WHEN** API o worker inicia conexión con `MONGODB_URI_FILE` válida
- **THEN** lee la URI completa y la entrega al driver sin copiarla a `process.env`
- **AND** no aparece en argumentos, diagnósticos ni logs

#### Scenario: URI productiva en texto plano

- **WHEN** producción recibe una URI Mongo con usuario/contraseña en `MONGODB_URI`
- **THEN** se rechaza la configuración antes de abrir la conexión
- **AND** el error identifica el campo sin mostrar el valor

#### Scenario: Cliente de servicio Keycloak

- **WHEN** Identity solicita usar el cliente de directorio y el archivo secreto está disponible
- **THEN** la composición lee el secreto y lo entrega al adaptador para esa operación
- **AND** client ID, issuer, audiencia y JWKS siguen siendo configuración no secreta

#### Scenario: Archivo secreto inválido

- **WHEN** falta el archivo, está vacío, excede 64 KiB, contiene NUL/BOM o no puede leerse
- **THEN** la operación falla con un código genérico sin revelar contenido ni ruta

### Requirement: Bootstrap e inicialización de Keycloak aislados

El bootstrap del administrador MUST ejecutarse en un proceso de una sola ejecución desde un archivo montado, sin incluir el valor en configuración renderizada de Compose, argumentos ni logs. El servicio Keycloak persistente MUST iniciarse sin ese secreto. La inicialización ordinaria de perfiles MUST usar un cliente de servicio separado, con permisos mínimos y sesión temporal no persistente.

#### Scenario: Bootstrap inicial

- **WHEN** se prepara una instalación Keycloak nueva y la imagen fijada admite un canal de archivo validado
- **THEN** un proceso temporal crea el administrador inicial y termina
- **AND** el servicio persistente inicia sin la contraseña de bootstrap en su configuración de Compose

#### Scenario: Canal seguro no disponible

- **WHEN** la imagen fijada no permite suministrar el secreto al bootstrap de forma validada
- **THEN** el proceso no vuelve a usar una variable de Compose con el valor ni imprime el secreto
- **AND** el bootstrap queda bloqueado y documentado como incompatibilidad

#### Scenario: Inicialización ordinaria de perfiles

- **WHEN** Compose ejecuta la actualización de realm/perfil
- **THEN** usa el secreto del cliente de servicio desde archivo y permisos mínimos comprobados
- **AND** elimina la sesión temporal aunque el comando falle

#### Scenario: Rotación de credenciales Keycloak

- **WHEN** se rota la contraseña del administrador o la credencial del cliente de servicio
- **THEN** primero se actualiza la credencial en Keycloak y luego su archivo montado correspondiente
- **AND** reemplazar solo el archivo no se considera una rotación completa

### Requirement: Formato uniforme de archivos secretos

El lector MUST decodificar UTF-8, preservar espacios significativos y quitar como máximo un terminador LF o CRLF final. MUST rechazar BOM, NUL, vacío y contenidos mayores de 64 KiB. Las rutas de archivo y errores no revelan contenidos secretos.

#### Scenario: Secreto con espacios o terminador

- **WHEN** un archivo contiene un secreto con espacios significativos y un LF/CRLF final
- **THEN** el lector preserva el secreto y elimina únicamente el terminador final

#### Scenario: Archivo fuera de formato

- **WHEN** el archivo contiene NUL/BOM, está vacío o supera el límite
- **THEN** el lector falla de forma cerrada con un error sanitizado
