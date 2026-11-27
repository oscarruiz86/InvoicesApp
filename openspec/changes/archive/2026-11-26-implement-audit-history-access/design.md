# Design

## Context

Véase [proposal.md](proposal.md) y [specs/audit/spec.md](specs/audit/spec.md). El journal `audit_events` ya tiene ID único, retención TTL, normalización estricta y writer Mongo; no tiene endpoint de lectura. `identity-access` conserva `audit:read` pendiente para todos los roles. El prototipo de navegación incluye Auditoría, pero las rutas deben depender de grants confirmados. La cobertura de productores se completa en `implement-audit-logging`.

## Goals / Non-Goals

**Goals:** permitir solo lectura global de APP_ADMIN; consultar el journal con filtros y cursor estables; registrar los accesos; mostrar campos seguros en la UI existente y ocultarla a quienes no tengan grant.

**Non-Goals:** acceso organizacional de COMPANY_ADMIN/THIRD_PARTY_ADMIN, exportaciones, mutación o borrado de eventos, búsqueda de payloads, backfill de colecciones locales, cambios a la retención o a la captura de Keycloak en producción.

## Decisions

### Grant inicial mínimo

Actualizar la matriz para permitir `audit:read` exclusivamente a APP_ADMIN con ámbito explícito GLOBAL. No inferir el grant del nombre del rol: el permiso debe estar habilitado en la política efectiva. Los demás roles siguen denegados. La futura lectura organizacional necesita su propia política de alcance y no se amplía por conveniencia en esta entrega.

**Alternativa considerada:** habilitar a administradores de empresa/tercero con filtros de ámbito desde el inicio. Se descarta porque los eventos actuales no garantizan de forma uniforme scope organizacional y la tabla vigente mantiene esos grants pendientes.

### API estrictamente de lectura

El listado también admite `actor` como nombre completo o sujeto. Los nombres se resuelven en Identity Directory; un identificador se filtra por coincidencia exacta. El filtro de sujeto resuelto forma parte de la huella del cursor y no se escribe en el hecho de lectura.

Publicar `GET /api/audit` y `GET /api/audit/{eventId}` con Bearer, scope global explícito y autorización `audit:read` revalidada en backend. Listado con filtros cerrados por origen, acción, resultado y fechas UTC, tamaño acotado y cursor opaco; sin orden libre, conteo global, exportación ni inclusión de payload. El orden será `occurredAt` descendente, con `eventId` como desempate y cursor compuesto para evitar duplicados al registrar cada lectura.

El listado acepta `scope=global` obligatorio, `from`/`to` opcionales en RFC 3339 UTC con milisegundos, `source`, `action`, `result`, `actor`, `pageSize` (1–100, default 20) y `cursor`. El intervalo inclusivo no supera dos años; filtros repetidos, desconocidos o inválidos se rechazan antes de leer datos. `action` debe pertenecer al catálogo normalizado y, si se especifica `source`, al catálogo de esa fuente. El cursor base64url lleva versión, snapshot temporal, tupla `(occurredAt,eventId)` y huella de todos los filtros aplicados, incluido el sujeto resuelto por `actor`. En páginas cursor se excluyen los eventos `AUDIT_HISTORY_READ` del milisegundo del snapshot; el filtro evita que el autorregistro de una misma cadena aparezca en páginas siguientes sin hacer crecer el cursor con cada página. Reutilizarlo con filtros distintos es inválido. La respuesta contiene `items`, `nextCursor` y `pageSize`, sin total ni offset.

El DTO allowlist contiene `eventId`, `occurredAt`, `source`, `actor.kind/subject`, `action`, `result`, `reason`, `correlationId`, `scope.companyId/thirdPartyId`, `resource.type/id`, `beforeVersion`, `afterVersion` y `suppressed` cuando existan. No incluye `captureOrigin`, `changedFields`, valores de negocio ni campos almacenados que no estén en esta lista.

**Alternativa considerada:** paginación por offset. Se descarta porque la escritura de un evento `AUDIT_HISTORY_READ` entre páginas desplazaría filas y podría duplicarlas u omitirlas.

### DTO de consulta separado del documento

Devolver solo fecha, actor verificado, origen, acción, resultado, razón categórica, correlación, scope/resource seguros, versiones y contador de eventos suprimidos. No devolver documento Mongo, representación, valores anteriores/nuevos de negocio, detalles libres ni secretos. El detalle usa la misma lista allowlist; no hay un payload expandido.

### Auditar cada lectura sin hacer la consulta autorreferente

Después de resolver la consulta autorizada, persistir un evento `AUDIT_HISTORY_READ` con actor verificado, correlación e instante, sin guardar filtros ni valores buscados. Si no se puede confirmar este registro durable, responder 503 sin entregar los eventos. Cada solicitud escribe un solo evento; ese evento no aparece en la respuesta que lo originó ni en páginas siguientes de la misma cadena. Una consulta nueva puede verlo incluso si se ejecuta en el mismo milisegundo. Los eventos `source=audit`, `action=AUDIT_HISTORY_READ` permiten contar accesos; la latencia y proporción de 503 se observan con las métricas HTTP agregadas de la plataforma, sin añadir actor, filtros ni valores de eventos como etiquetas.

**Alternativa considerada:** no auditar consultas para reducir volumen. Se descarta por la sensibilidad del journal y por la necesidad de trazabilidad de acceso.

### Frontend dentro del grant efectivo

Reutilizar la ruta `/audit` y componentes de tablas/detalle existentes. Mostrar grupo de navegación solo con `audit:read` efectivo; en frontend se mejora la navegación, pero el backend sigue siendo autoridad. La pantalla no muestra cambios sensibles ni permite exportar.

### Presentación legible de actores y acciones

La lista muestra la acción con una etiqueta breve en español y conserva su código normalizado en el detalle para facilitar soporte y correlación. Capturas pendientes `COMPANY_ADMIN_ASSOCIATED` se aceptan como acción histórica permitida para evitar que bloqueen la cola de Organizaciones. Para actores tipo usuario, el backend intenta resolver únicamente el nombre completo actual mediante el lector de perfiles de Identity Directory; el email, documento y roles no se incorporan al DTO. El nombre se cachea en memoria cinco minutos con un máximo de mil sujetos, se limita a ocho resoluciones concurrentes y un fallo abre un circuito de 30 segundos. Si la identidad ya no existe o el directorio no está disponible, se devuelve el identificador del actor y la consulta de auditoría sigue disponible. Este es un enriquecimiento actual, no una instantánea histórica del nombre.

## Risks / Trade-offs

- [APP_ADMIN puede consultar datos centrales de todos los ámbitos] → Conceder únicamente el grant global administrativo, usar campos mínimos y registrar cada lectura; mantener controles de acceso a identidad de APP_ADMIN.
- [Auditar cada solicitud añade escritura y latencia] → Mantener filtros y página acotados, usar cursor estable y medir el costo sin reducir la garantía de acceso.
- [Los eventos de lectura pueden dominar el listado] → Permitir filtro explícito por acción/origen y documentar que las lecturas son eventos normales sujetos a la misma retención.
- [La matriz del frontend puede tardar en refrescar] → El endpoint vuelve a comprobar grant en cada petición; una UI obsoleta no obtiene datos.
- [La cobertura central todavía depende de otro cambio] → No declarar historial completo hasta integrar `implement-audit-logging` y validar su matriz de productores.

## Migration Plan

No hay historiales locales que migrar en el entorno de desarrollo actual. Desplegar la migración de política con `audit:read` global APP_ADMIN y la API protegida antes de habilitar el acceso UI. La expiración TTL existente continúa. En rollback retirar el grant y deshabilitar rutas/UI sin borrar eventos centrales; la navegación oculta el grupo cuando el grant desaparece.

## Open Questions

Ninguna para la versión inicial: lectura global APP_ADMIN se presenta como decisión propuesta para revisión. La consulta organizacional y la exportación quedan fuera.
