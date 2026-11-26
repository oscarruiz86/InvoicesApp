# Captura local de eventos administrativos de Keycloak

El realm importado para desarrollo graba eventos administrativos y mantiene desactivada la captura de representaciones. Esta configuración vive en `keycloak/invoices-realm.json`, que está excluido de la imagen de producción. No habilita la captura en realms productivos.

## Preparar el lector local

El lector es el cliente confidencial `invoices-admin-audit-reader`, separado de los clientes de inicialización de perfiles. Su cuenta técnica recibe solo `realm-management:view-events`. El secreto se lee desde un archivo local y no se guarda en el repositorio:

```sh
mkdir -p secrets
openssl rand -hex 32 > secrets/keycloak-admin-audit-client-secret
chmod 600 secrets/keycloak-admin-audit-client-secret
```

El comando también requiere el archivo local `secrets/keycloak-bootstrap-admin-password`, usado para la inicialización administrativa local. Ejecutar el perfil configura el realm local existente, aprovisiona el lector y arranca el colector:

```sh
docker compose --profile keycloak-admin-audit up --build keycloak-admin-audit-worker
```

El worker requiere que el cambio del módulo Audit esté presente para cargar su adaptador MongoDB. Deja de capturar al detener el perfil; el cursor local conserva la última ventana completada y el colector repite con solapamiento las ventanas incompletas. Sus logs muestran únicamente cantidades entregadas o un código de fallo, sin eventos ni credenciales.

## Privacidad y recuperación

El colector usa el ID y tiempo del proveedor para formar una clave estable, y solo envía el actor, tipo de operación, categoría y recurso validados al contrato compartido de Audit. Omite representación de recursos, campos libres, dirección IP, credenciales y tokens. Un fallo de Audit no actualiza el cursor. Reintentos repiten el mismo ID y Audit los acepta idempotentemente.

La fuente de recuperación es el feed de Keycloak: si el colector permanece detenido más allá de la retención configurada por Keycloak, los eventos ya eliminados allí no se pueden reconstruir. Audit conserva cada evento aceptado durante dos años; la expiración MongoDB ocurre de forma asíncrona.

## Runtime productivo (opt-in, aún no desplegado)

La aplicación no contiene un despliegue productivo de Keycloak. Cuando exista, el operador debe configurar el worker por separado del perfil Compose local. Con `NODE_ENV=production`, la ausencia total del grupo deja el proceso deshabilitado; si se configura cualquier variable del grupo, se exige `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED=true` y todas las opciones requeridas. Las variables de conexión son:

```text
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED=true
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_BASE_URL=https://<host-keycloak>
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_REALM=<realm>
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_ID=invoices-admin-audit-reader
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET_FILE=/run/secrets/keycloak-admin-audit-client-secret
KEYCLOAK_ADMIN_AUDIT_PRODUCTION_WRITER_MODULE=<ruta-runtime-al-writer-Audit>
MONGODB_URI_FILE=/run/secrets/mongodb-uri
```

La URL productiva debe usar HTTPS. El secreto del cliente y la URI Mongo se montan desde el gestor de secretos como archivos de solo lectura. No se define `*_CLIENT_SECRET` ni `MONGODB_URI` inline. La cuenta bootstrap del administrador no debe utilizarse desde el runtime del worker; el script `keycloak-admin-audit-init` pertenece solo al perfil local.

El runtime productivo debe iniciar `npm run keycloak:admin-audit:production-worker`, que no carga `.env.local`. El comando local `keycloak:admin-audit:worker` conserva la carga del perfil de desarrollo.

En el realm productivo, activar **Admin events / Save events** y mantener **Include representation** apagado. La representación contiene documentos JSON enviados al Admin REST y puede almacenar información innecesaria. No activar **User events / Save events** como parte de esta integración ni cambiar sus tipos existentes. La retención del feed de Keycloak debe ser suficiente para el retraso operativo que admita el despliegue.

La API Admin REST de Keycloak 26.8.x permite revisar la configuración con `GET /admin/realms/{realm}/events/config`; el feed se lee desde `GET /admin/realms/{realm}/admin-events` con fechas, orden y paginación. En un realm desechable, comprobar `adminEventsEnabled=true`, `adminEventsDetailsEnabled=false`, que la lectura de eventos responda 200 y que user-event capture no se haya activado por este cambio. No ejecutar estas comprobaciones contra un realm productivo durante el despliegue de esta propuesta.

El cliente confidencial `invoices-admin-audit-reader` debe tener service accounts habilitadas y permisos directos desactivados. Asignar a su service account únicamente `realm-management:view-events`; no conceder `manage-events`, `manage-realm`, `manage-clients`, `manage-users` ni `realm-admin`. Comprobar por Admin REST que el cliente obtiene el feed y que las operaciones de escritura sobre realm, cliente y role mappings son denegadas. El aprovisionamiento productivo de esta identidad y su secreto es externo al repositorio.

El worker registra conteo entregado y retraso de cursor, además de un fallo/reintento categórico; nunca imprime tokens, secretos ni respuesta del proveedor. Para rotar la credencial, actualizarla en Keycloak y en el gestor de secretos de forma coordinada, montar el archivo nuevo y reiniciar el worker. Si falla la consulta o la autenticación, el cursor no avanza y el proceso reintenta; observar `keycloak_admin_audit_poll_failed` y el `lagMs` hasta recuperar el feed. El despliegue debe alertar cuando el retraso se acerque a la retención de Keycloak.

### Verificación local aislada

El smoke test de permisos solo admite una URL loopback y requiere `KEYCLOAK_ADMIN_AUDIT_TEST_DISPOSABLE=1`. Usa la cuenta bootstrap y el lector únicamente contra un realm local desechable; comprueba la configuración de eventos por Admin REST, lectura del feed, respuesta 403 al intentar modificar realm/cliente/roles y que la cuenta tenga exactamente `view-events` en `realm-management`.

```powershell
$env:KEYCLOAK_ADMIN_AUDIT_TEST_DISPOSABLE='1'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_BASE_URL='http://127.0.0.1:18080'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_REALM='invoices'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_CLIENT_ID='invoices-admin-audit-reader'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_CLIENT_SECRET_FILE='..\secrets\keycloak-admin-audit-client-secret'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_ADMIN_USERNAME='invoices-local-admin'
$env:KEYCLOAK_ADMIN_AUDIT_TEST_ADMIN_SECRET_FILE='..\secrets\keycloak-bootstrap-admin-password'
npm run test:keycloak:admin-audit-reader
```

No uses esta prueba contra una instancia compartida o productiva: verifica explícitamente denegaciones de escritura sobre el realm y sus asignaciones de roles.
