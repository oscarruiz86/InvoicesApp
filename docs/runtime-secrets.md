# Secretos de ejecución

El backend usa archivos montados en modo solo lectura para secretos productivos. Compose almacena únicamente las rutas; el gestor Mongo lee `MONGODB_URI_FILE` al abrir la conexión y no copia la URI a `process.env`. En desarrollo y pruebas se permite `MONGODB_URI` inline solo para instancias sin credenciales.

## Formato del archivo

Los archivos deben contener UTF-8 válido, sin BOM, NUL, contenido vacío ni más de 64 KiB. El lector quita como máximo un terminador LF o CRLF y conserva los demás espacios y saltos. Los errores no incluyen la ruta ni el contenido. Monta los archivos como solo lectura y limita su lectura al usuario del contenedor; el lector de aplicación no sustituye los permisos del host.

## Variables de producción

- API y worker: define `MONGODB_URI_FILE=/run/secrets/mongodb-uri`; no definas `MONGODB_URI`.
- API: define `KEYCLOAK_DIRECTORY_CLIENT_ID` y `KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE=/run/secrets/keycloak-directory-client-secret`; el archivo se lee cuando se consulta el directorio.
- SMTP y cifrado de payload: consulta [notifications.md](notifications.md), que documenta `SMTP_PASSWORD_FILE` y el keyring montado.
- Firma de credenciales offline: define `OFFLINE_CREDENTIAL_SIGNING_KEY_FILE` y `OFFLINE_CREDENTIAL_KEY_ID`; monta una clave privada PKCS#8 ES256 como archivo de solo lectura. Compila `VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS` con las claves públicas confiables y sus `kid`, sin el parámetro privado `d`. Para rotar, publica primero el JWKS que incluya la clave nueva y la anterior, cambia la clave emisora del servidor y conserva la anterior hasta 8 horas después de que deje de emitir tickets con ella. El ticket dura como máximo 8 horas y no es token de API.

El worker de producción de notificaciones ya monta Mongo, SMTP y las claves de cifrado como archivos de solo lectura. El despliegue de la API debe montar también su URI Mongo y, si consulta perfiles/roles, el secreto de cliente Keycloak.

## Desarrollo local

El cliente de directorio Keycloak también usa un archivo en desarrollo. Guarda su valor únicamente en `secrets/keycloak-directory-client-secret`, carpeta ignorada por Git. Para ejecutar el backend desde el host, define en `backend/.env.local`:

```env
KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE=../secrets/keycloak-directory-client-secret
```

No definas `KEYCLOAK_DIRECTORY_CLIENT_SECRET` en `.env.local`. Compose monta `./secrets` como `/run/secrets` y establece `KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE=/run/secrets/keycloak-directory-client-secret` para el contenedor backend; esta ruta interna sustituye la ruta relativa del host.

En desarrollo, `MONGODB_URI` solo se admite para Mongo local sin usuario ni contraseña. Si la URI contiene credenciales, usa un archivo `secrets/mongodb-uri`, configura `MONGODB_URI_FILE` y ajusta el montaje de Compose antes de iniciar el backend.

## Rotación y retroceso

Cambiar un archivo no cambia la credencial que el servidor remoto espera. Para Mongo, crea primero un usuario/URI nuevo, despliega el archivo y reinicia/recrea los consumidores; revoca la credencial anterior cuando los procesos ya usen la nueva. Para el cliente de directorio, rota primero el secreto del cliente en Keycloak, actualiza el archivo montado y reinicia la API. Para SMTP, rota la contraseña en el proveedor y después el archivo SMTP.

Retrocede solo a una imagen que admita las mismas referencias `_FILE` y el formato de archivo. Compose fija por defecto el digest compatible de Keycloak; `KEYCLOAK_IMAGE` permite elegir otro artefacto solo si ya fue validado. Ejecuta `node scripts/test-keycloak-image-rollback.mjs` para probar el cambio y rollback sobre un volumen temporal: las dos imágenes fixture se construyen desde el mismo digest fijado, así que la prueba valida el montaje de secretos, el cambio de imagen y la conservación de datos sin probar una bajada de versión/esquema. Antes de usar un digest diferente en un entorno real, valida esa versión por separado. No recuperes una imagen antigua pasando el secreto a una variable plana. Mantén la credencial anterior activa solo durante la ventana necesaria para completar el cambio y retroceso compatible.

## Migración de Keycloak

El servicio persistente Keycloak ya no recibe credenciales de bootstrap. Para un volumen nuevo, el perfil puntual `keycloak-bootstrap` lee la contraseña desde archivo antes del primer arranque. No ejecutes ese paso para volúmenes existentes. Para estos, arranca el servicio sin credenciales de bootstrap y ejecuta una vez `keycloak-profile-migrate` con la contraseña administrativa vigente en archivo; crea el cliente `invoices-profile-init` y aplica el perfil sin borrar el volumen. El inicializador habitual usa solo el cliente separado y sus permisos mínimos (`manage-realm`, `manage-clients`, `view-clients`, `query-clients`), más el scope de audiencia `kc-admin-api` requerido por Keycloak 26.8.2 para el Admin REST API. La sesión `kcadm` y los archivos de configuración viven en `/run/kcadm`, un `tmpfs` eliminado al acabar el contenedor.

La contraseña bootstrap no va en `.env`: mueve el valor local existente a `secrets/keycloak-bootstrap-admin-password` con un editor y quita la variable plana de `.env`. Mantén disponible la cuenta administrativa existente; la migración no rota ni elimina credenciales. El secreto del cliente de perfiles va en `secrets/keycloak-profile-init-client-secret`. Ambos archivos están bajo `secrets/`, ignorado por Git y montado en solo lectura.

Rotar un archivo no cambia la credencial que Keycloak ya acepta. Para el cliente de perfiles, cambia primero el secreto del cliente en Keycloak y actualiza después el archivo; recrea `keycloak-profile-init`. Para bootstrap, actualiza el archivo después de cambiar la contraseña de la cuenta temporal en Keycloak. Antes de cambiar imágenes, respalda el volumen y permite rollback solo a una imagen compatible con las mismas referencias `_FILE`; no uses credenciales planas ni borres volúmenes para recuperar una versión anterior.
