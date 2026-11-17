# Design

## Contexto y amenazas

La configuración pública de Keycloak —issuer, realm, audiencia, JWKS y client ID— puede seguir en variables de entorno. Las credenciales sensibles identificadas son:

- `MONGODB_URI` cuando incluye credenciales. El worker actual lee `MONGODB_URI_FILE`, pero copia el contenido a `process.env`; las rutas de composición de API también requieren actualmente una URI como string.
- `KEYCLOAK_DIRECTORY_CLIENT_SECRET`, que la composición lee directamente desde `process.env`.
- `KC_BOOTSTRAP_ADMIN_PASSWORD`, que Compose entrega tanto a Keycloak como a `keycloak-profile-init`; el inicializador la interpola en los argumentos de `kcadm`.
- Tokens de administración de `kcadm`, cuyo archivo de sesión podría permanecer en la capa escribible del contenedor que terminó.

La protección evita que los valores aparezcan en configuración renderizada de Compose, argumentos, logs, imágenes, archivos persistentes o repositorio. Los secretos pueden existir en memoria mientras la conexión u operación que los necesita esté activa; no se promete borrado inmediato de memoria del runtime.

## Decisiones

1. **Archivos y lectura exacta.** Usar referencias `MONGODB_URI_FILE`, `KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE` y `KC_BOOTSTRAP_ADMIN_PASSWORD_FILE`. Leer UTF-8, aceptar como terminador solo un LF o CRLF final, preservar espacios significativos y rechazar BOM, NUL, archivo vacío o contenido mayor de 64 KiB. Los errores serán genéricos, sin revelar ruta ni contenido. Los archivos se montan de solo lectura y con permisos para el usuario del servicio.
2. **Lector común.** Mover el contrato/adaptador genérico desde Notifications a infraestructura compartida del backend. Los puntos de composición inyectan secretos en memoria; Identity no importa adaptadores de Notifications ni infraestructura de Mongo. La lectura es asíncrona.
3. **Mongo.** Pasar la referencia al gestor de conexiones y leerla justo antes de crear el pool. No asignar el valor a `process.env`. Aplicar el flujo a todos los entrypoints, incluida la API Next standalone y el worker. En desarrollo se conserva la URI local sin autenticación; producción rechaza una URI con credenciales inline.
4. **Cliente de servicio Keycloak.** Mantener client ID, issuer, audiencia y JWKS como configuración no secreta. Leer el secreto de archivo para la operación de autenticación y no persistirlo ni registrarlo. La renovación del archivo tendrá efecto en nuevas operaciones sin guardar el secreto en una variable de módulo indefinida.
5. **Bootstrap inicial de Keycloak.** Separar un contenedor/proceso de bootstrap de una sola ejecución del servicio Keycloak persistente. El proceso temporal lee el archivo y usa el canal probado de la imagen fijada (preferir `bootstrap-admin user` con una variable de entorno creada solo dentro de ese proceso; el valor no va en `Config.Env` de Compose ni en argumentos). Keycloak arranca luego sin la contraseña de bootstrap en su configuración. Si el canal no se valida, no se afirma que el bootstrap seguro está resuelto.
6. **Inicialización habitual.** `keycloak-profile-init` deja de autenticar con el administrador inicial. Usa un cliente de servicio separado y secreto en archivo, con los roles mínimos para modificar realm, cliente y perfil. Invoca `kcadm` sin incluir la contraseña en argumentos, utiliza una sesión temporal en `tmpfs`/ruta privada y `--no-config` cuando el comando lo permita; el contenedor temporal se elimina incluso si falla.
7. **Rotación de credenciales.** Cambiar un archivo por sí solo no cambia la credencial almacenada en Keycloak. Para rotar la contraseña administrativa se cambia primero en Keycloak y después se actualiza el archivo usado por tareas administrativas puntuales. La cuenta de servicio se rota coordinando el secreto nuevo en Keycloak y el archivo montado; se define la secuencia y ventana de indisponibilidad según soporte de secretos simultáneos de la versión fijada. Mongo aplica el nuevo archivo al reiniciar el pool/proceso.
8. **Rollback compatible.** El destino normal de rollback debe ser una imagen que ya lea secretos desde archivos. No se reintroducen valores planos como fallback. Si la imagen anterior no es compatible, la propuesta no promete rollback directo a ella; la migración debe declarar ese límite y conservar la última imagen compatible y sus referencias de archivo.
9. **Configuración ambigua.** En producción se rechaza configurar simultáneamente valor sensible inline y referencia de archivo. Desarrollo permite `MONGODB_URI` inline solo si la URI no incluye usuario ni contraseña. Los diagnósticos identifican nombres de campos/códigos, nunca valores.

## Compatibilidad local

Compose de desarrollo monta `./secrets` de solo lectura. Mongo local sin autenticación conserva la URI actual. Los ejemplos contienen rutas ficticias y datos de ejemplo, no contraseñas, tokens, client secrets ni URIs autenticadas. Se audita `.gitignore`, que ya debe excluir `.env*` reales, historiales y `secrets/`, manteniendo las plantillas `.example` versionables.

## Riesgos y límites

- Keycloak documenta opciones de bootstrap mediante variables y `bootstrap-admin`; el comportamiento y los permisos de la imagen fijada deben verificarse antes de dar por completada la tarea.
- Una cuenta de servicio de perfiles debe limitarse a las operaciones que hoy ejecuta el script. Si Keycloak no permite separar permisos, la excepción debe documentarse y aprobarse antes de ampliar permisos.
- Los archivos montados protegen contra la exposición accidental en configuración de contenedor; no sustituyen los permisos, cifrado de disco, auditoría, backup, disponibilidad y revocación del host.

## Validación

- Pruebas unitarias de encoding, terminadores LF/CRLF, espacios significativos, NUL, BOM, tamaño, vacío, falta de permisos y mensajes sanitizados.
- Integración Mongo aislada con URI de archivo; comprobar que API y worker no la copian a `process.env`, argumentos, logs ni errores.
- Pruebas Keycloak aisladas del bootstrap puntual, cliente de servicio de perfiles, permisos insuficientes, rotación y archivo ausente.
- Inspeccionar Compose renderizado, configuración de proceso, argumentos, archivos de sesión y filesystem temporal usando secretos ficticios.
- Verificar `.gitignore` con `git check-ignore` para `.env`, copias históricas y `secrets/`, y confirmar que los ejemplos quedan sin ignorar.
- Preproducción: permisos restringidos, reinicio, rotación, rollback a imagen compatible y autenticación; no usar ni incluir secretos reales en reportes.
