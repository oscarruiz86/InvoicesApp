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
