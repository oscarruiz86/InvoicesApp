# Proposal

## Why

El proyecto ya lee la contraseña SMTP y las claves AES desde archivos montados, pero otros accesos sensibles usan valores de entorno. `MONGODB_URI` puede contener credenciales; `KEYCLOAK_DIRECTORY_CLIENT_SECRET` llega por `process.env`; y Compose entrega `KC_BOOTSTRAP_ADMIN_PASSWORD` a Keycloak y a `keycloak-profile-init`, cuyo comando la expande en argumentos de `kcadm`. El entrypoint productivo del worker también vuelve a poner en `process.env` la URI leída desde archivo.

## What Changes

- Resolver la URI Mongo autenticada desde archivo en API y worker, sin copiarla a `process.env`.
- Leer `KEYCLOAK_DIRECTORY_CLIENT_SECRET` desde archivo mediante infraestructura compartida.
- Separar el bootstrap inicial del administrador, ejecutado como proceso temporal, del inicializador de perfiles de uso habitual, que tendrá una cuenta de servicio con permisos mínimos.
- Definir la vida de los secretos en memoria, el formato/encoding de archivos, límites de tamaño, permisos, rotación y rollback compatible.
- Verificar el `.gitignore` existente y ampliar sus reglas solo si la auditoría detecta huecos; mantener versionables únicamente ejemplos seguros.

## Capabilities

### Modified Capabilities

- `backend-runtime`: resolución privada de credenciales de Mongo e identidad desde archivos montados.
- `local-development`: suministro local seguro de secretos y ejemplos sin credenciales.

## Decisión de despliegue

Se reutilizan archivos montados de solo lectura, según la decisión ya aprobada para Notifications. No se fija un proveedor. Los secretos pueden residir en memoria del proceso mientras una conexión u operación los necesite; no deben quedar en configuración de contenedor, argumentos, logs ni almacenamiento persistente.

## Impact

Afectará configuración y conexiones compartidas del backend, la composición de Identity e Invitations, los entrypoints de API/worker, Dockerfiles/Compose, los ejemplos de entorno y la documentación de runtime y autenticación.

Keycloak documenta el bootstrap inicial mediante variables y un comando `bootstrap-admin` que puede ejecutarse antes del primer arranque. También ofrece una fuente Java KeyStore para opciones sensibles. La implementación verificará el canal contra la imagen fijada; no asumirá que existe soporte nativo `*_FILE`. Referencias: [contenedores Keycloak](https://www.keycloak.org/server/containers), [configuración Keycloak](https://www.keycloak.org/server/configuration), [bootstrap de administrador](https://www.keycloak.org/server/bootstrap-admin-recovery).

## Fuera de alcance

No rotar credenciales reales, reiniciar Keycloak/Mongo productivos, instalar un gestor externo, cambiar los roles funcionales del realm, configurar una base de datos externa para Keycloak ni desplegar servicios. La contraseña de bootstrap no se utilizará como credencial diaria. La rotación real se ejecutará por el operador después de aplicar y validar el cambio.
