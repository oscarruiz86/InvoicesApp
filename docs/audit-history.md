# Consulta de auditoría

## Acceso y privacidad

Solo `APP_ADMIN` con el grant efectivo `audit:read` en ámbito `GLOBAL` puede listar o abrir eventos. El backend verifica el grant en cada petición antes de acceder a `audit_events`. Los demás roles y un contexto organizacional reciben una respuesta neutral de acceso denegado.

La API ofrece filtros cerrados por fecha UTC, origen, acción y resultado, páginas de hasta 100 elementos y orden descendente por `occurredAt`/`eventId`. El cursor conserva el snapshot y la última tupla; las páginas siguientes excluyen autorregistros del mismo milisegundo, con lo que su tamaño permanece acotado aunque la navegación tenga muchas páginas. No hay total, offset, exportación ni mutación. El DTO es allowlist y omite `captureOrigin`, `changedFields`, valores de negocio, payloads y cualquier propiedad nueva que se agregue al documento Mongo.

## Autorregistro

Cada lista o consulta de detalle autorizada persiste un `AUDIT_HISTORY_READ` antes de responder. El hecho contiene solo el subject verificado, su ID, la correlación y el instante. No se persisten filtros, query string ni el ID del evento consultado. Si el journal no confirma la escritura durable, el endpoint responde `503` y no entrega resultados.

El hecho de la primera página no se devuelve en esa misma respuesta. Las páginas cursor excluyen hechos `AUDIT_HISTORY_READ` ocurridos en el mismo milisegundo del snapshot, incluidos los generados por las páginas anteriores de esa cadena. Una nueva consulta abre un cursor nuevo y puede ver los accesos anteriores. Los hechos de lectura usan la retención común de dos años y pueden aparecer en la misma tabla de auditoría.

## Métricas y operación

- Volumen de accesos: contar `audit_events` con `source=audit` y `action=AUDIT_HISTORY_READ`, agrupados por intervalo. No añadir subjects, filtros ni IDs de negocio como etiquetas.
- Disponibilidad: observar respuestas HTTP `503` para `/api/audit` y `/api/audit/{eventId}` desde la telemetría agregada del despliegue.
- Latencia: observar duración agregada de esas rutas desde la telemetría HTTP del despliegue, segmentada por operación (lista/detalle), nunca por actor o filtro.

La aplicación no añade un exporter Prometheus específico para estas rutas. La colección central sí permite medir el volumen de lecturas; la instrumentación de latencia y estado depende del agente HTTP/APM configurado en cada despliegue. No se debe interpretar la ausencia de esos datos como cobertura completa de productores: revisar la matriz de fuentes/acciones de `implement-audit-logging`.
