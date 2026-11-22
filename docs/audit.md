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

Las operaciones de Organizations usan el mismo contrato en su transacción MongoDB. El worker es necesario para los cambios de política diferidos; no sustituye las garantías transaccionales de los productores.
