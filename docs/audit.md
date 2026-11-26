# Auditoría

## Contrato y datos

Los productores entregan hechos normalizados a `AuditWriter`. El contrato conserva el ID estable, instante UTC, origen, actor verificado, acción, resultado, motivo categórico, correlación y, cuando fueron validados por el servidor, alcance, recurso y revisiones. No acepta credenciales, tokens, claims completos ni payloads libres. El registro se guarda en `audit_events`, con `_id` igual a `eventId`; escrituras repetidas del mismo hecho son idempotentes y una reutilización del ID con contenido distinto es un conflicto.

Los documentos son append-only. El índice TTL expira cada evento dos años calendario después de `occurredAt`. MongoDB no elimina de forma puntual: el monitor TTL puede tardar después de la fecha elegible, pero un evento no se elimina antes. El índice se crea idempotentemente cuando se inicializa el adaptador. Incluir `audit_events` en copias de seguridad operativas y aplicar el control de acceso de MongoDB vigente.

No hay endpoint de historial. `audit:read` continúa denegado mientras no exista una política de consulta aprobada.

## Entrega de cambios de política

`authorization_policies.pendingEvents` es el outbox duradero: el cambio de política y su evento se confirman juntos. El worker inserta el evento en Audit y luego elimina solo ese `eventId` del outbox. Si se interrumpe después del insert, el siguiente intento se deduplica por ID antes de confirmar el outbox.

En desarrollo local, inicializa antes la política con `npm --prefix backend run authorization:init`; el worker lee su outbox de `authorization_policies`. Luego inicia la entrega:

```powershell
docker compose --profile audit up -d audit-outbox-worker
docker compose --profile audit logs -f audit-outbox-worker
```

El worker registra únicamente cantidades entregadas y códigos categóricos de error; nunca registra el cuerpo de los eventos. Ante una falla temporal conserva las capturas y reintenta con espera. Si el outbox alcanza su capacidad configurada, la actualización de política falla cerrada y requiere recuperar primero la entrega; no se descartan eventos para liberar espacio. Para detenerlo, usa `docker compose --profile audit stop audit-outbox-worker`; los eventos pendientes permanecen para el siguiente inicio.

Las operaciones de Organizations usan el mismo contrato. Contexto y cambios de membresía/asociación escriben en su transacción propietaria; compañías, terceros e invitaciones guardan su captura en la misma transacción local y la entregan mediante `audit-outbox-worker`. El adaptador solo proyecta `eventId`, actor, acción, correlación, recurso, alcance, instante y versión. No envía perfiles, roles, destinatarios, hashes, enlaces ni tokens. No duplica los eventos de membresía o contexto que ya escribían directamente en Audit.

## Outbox de Organizations y operación

Inicia el worker compartido para cambios de política, compañías, terceros e invitaciones en desarrollo:

```powershell
docker compose --profile audit up -d audit-outbox-worker
docker compose --profile audit logs -f audit-outbox-worker
```

El log `audit.outbox.delivered` informa la cantidad de capturas aceptadas por lote. `audit.outbox.error` contiene solo un código categórico; no incluye payloads ni datos de personas. Si Audit falla, la captura local permanece con `delivered:false` y el worker reintenta después de la pausa configurada. Si se interrumpe tras escribir en el journal y antes del ack, el reintento usa el mismo `eventId`; Audit deduplica el evento y el worker completa el ack.

Un evento inválido también permanece pendiente y detiene ese lote. No se borra ni se marca como entregado para liberar espacio. Revisa el ID técnico y el código de error en el entorno restringido, corrige el mapeo o los datos de la captura y reinicia el worker. No copies el documento local completo a logs o tickets.

Para rollback, detén el worker; las capturas pendientes se conservan para reanudar la entrega:

```powershell
docker compose --profile audit stop audit-outbox-worker
```

Prueba de operación en una base aislada `_test` (sin modificar colecciones locales preexistentes):

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27018/invoices_test?replicaSet=rs0&directConnection=true'
npm --prefix backend run test:integration -- tests/integration/management-audit-outbox.test.ts
```

Esta prueba crea su propia base `invoices_org_audit_<id>_test`, ejercita reintentos y rollback de ack, verifica la entrega de invitaciones y elimina solo esa base temporal.

## Fleet

Las mutaciones de conductor, vehículo y asignación escriben su línea local y el evento `source: fleet` con el mismo `eventId` dentro de la transacción propietaria. Las acciones se normalizan como `DRIVER_PROVISIONED`, `DRIVER_MIGRATED`, `DRIVER_ACTIVATED`, `DRIVER_DEACTIVATED`, `VEHICLE_CREATED`, `VEHICLE_UPDATED`, `VEHICLE_ACTIVATED`, `VEHICLE_DEACTIVATED`, `ASSIGNMENT_CREATED` y `ASSIGNMENT_CLOSED`. El journal conserva actor, correlación, tercero, recurso y versiones; no contiene nombres, placa, tarjeta de propiedad, perfil del conductor ni contenido de la asignación.

`driver_management_events`, `vehicle_management_events` y `assignment_events` se conservan porque alimentan consultas de módulo y otras reglas. La captura central no cambia sus endpoints, filtros, orden, paginación ni permisos. Si Audit falla, la transacción revierte también la mutación y el evento local; un reintento confirmado usa una nueva identidad solo para una nueva operación.

## Facturas y sincronización offline

La creación y edición de facturas escriben `invoice_events` y `audit_events` en la misma sesión. El evento central guarda origen `MANUAL`/`QR`, nombres de campos de una lista acotada, actor, correlación, tercero, recurso y versiones. Los valores de factura, imágenes y contenido QR no se copian. Las decisiones administrativas offline usan el `eventId` de `invoice_sync_resolution_events`; la evidencia local conserva la razón operativa y el journal común solo registra la categoría `OFFLINE_RESOLUTION`. Las consultas locales de factura e historial offline mantienen sus filtros, orden y permisos.

## Parámetros y catálogos

Las mutaciones efectivas de parámetros y catálogos escriben su evento tipado local y la línea central dentro de la misma transacción. Los valores anterior/nuevo de parámetros y las etiquetas, nombres y cargas completas de catálogos permanecen en los registros locales. El journal central conserva acción, actor, correlación, recurso y versiones. Las lecturas de historial siguen usando `configuration_events` y `parametric_catalog_events`; no se expone un endpoint transversal ni se concede `audit:read`.

La retención TTL de dos años aplica al journal central. Las colecciones locales mantienen su política actual y siguen siendo la evidencia consultable por cada módulo.
