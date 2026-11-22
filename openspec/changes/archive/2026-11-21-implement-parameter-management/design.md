# Design

## Context

InvoiceEditPolicy ya existe con durationSeconds, revision, scope, validFrom y validUntil. InvoiceEditPolicyReader recibe thirdPartyId y el puerto de confirmación recibe revisión, ámbito y transactionContext. Bootstrap inyecta UNAVAILABLE en lectura y una confirmación que falla. El evaluador usa createdAt, reloj servidor y borde exclusivo sin duración guardada por factura.

Identity concede parameters:read/update únicamente a APP_ADMIN global; parameters:create/deactivate están reconocidos pero no concedidos. /parameters es marcador con contexto active y necesita guard global explícito. La especificación Configuration está solo en initial-invoices-app. QR sigue como cambio activo con tareas pendientes aunque ya hay código QR en Invoices: verificar compatibilidad por pruebas, sin declarar ese cambio completo.

El usuario aprobó 12 horas como duración inicial el 21 de noviembre de 2026. No se encontraron otros valores iniciales funcionales aprobados; fixtures de 3600 segundos no son configuración de producto.

## Goals / Non-Goals

**Goals:** catálogo cerrado, política global efectiva, administración versionada e integración transaccional que sustituya adaptadores pendientes de Invoices.

**Non-Goals:** editor arbitrario de claves, ámbito empresa/tercero con precedencia, vigencias futuras programables, altas/bajas HTTP, secretos, configuración técnica, Keycloak o visor global de Audit.

## Decisions

### Catálogo y modelo

| Atributo | Propuesta |
| --- | --- |
| Clave | invoice.manual-edit-window-seconds |
| Nombre | Ventana de edición de facturas manuales |
| Tipo / unidad | Entero / segundos |
| Inicial aprobado | 43200 (12 horas) |
| Rango propuesto | 1–31536000 segundos (hasta 365 días) |
| Ámbito | global |
| Editables | Solo value con expectedVersion |
| Servidor | version, effectiveFrom, createdAt/By, updatedAt/By |

El máximo es una propuesta de límite funcional/técnico para revisión, no una cifra suministrada por el usuario. La UI indica segundos y equivalencia legible en horas/minutos para evitar conversiones ambiguas. Metadatos de catálogo viven en código; persistir solo clave, ámbito, valor, versión, vigencia y actores. Proponer colección functional_parameters con clave única (scope,key), eventos configuration_events con eventId único y orden estable por instante/id.

No se ofrecen overrides por tercero porque el permiso actual es global y no hay necesidad aprobada de jerarquías. La petición interna conserva thirdPartyId por compatibilidad, pero resuelve la misma política global; no transforma lectura interna en endpoint público para conductores.

### Vigencia y efecto temporal

Cada cambio es efectivo al confirmarse con effectiveFrom generado en servidor; validUntil=null para la revisión actual. No se programa activación futura ni vencimiento editable. El historial conserva revisiones reemplazadas. Resolución entrega revisión opaca no vacía, scope='global', validFrom y duración. Faltante, inválido o error → UNAVAILABLE, nunca fallback de 43200.

La duración vigente afecta a facturas anteriores y puede reabrir una ventana manual si se amplía o cerrarla si se reduce, siempre manteniendo las demás restricciones. No se modifican facturas ni auditoría histórica al cambiar el parámetro. Inicio createdAt y borde now < createdAt + durationSeconds permanecen iguales. QR protegido se rechaza independientemente del plazo o disponibilidad de Configuration.

### Contratos públicos y dependencias

Backend modules/configuration contiene domain (catálogo/invariantes), application (consultar/actualizar/resolver/confirmar y puertos), infrastructure/mongodb (repositorio y participante transaccional), presentation (Zod/HTTP). Frontend modules/parameter-management tiene contratos HTTP, adaptador, vistas y dominio puro donde aporte validación local. app/bootstrap componen dependencias.

Configuration expone su propio contrato neutral; adaptadores de integración externos traducen a InvoiceEditPolicyReader y InvoiceEditPolicyConfirmationPort ya existentes. Configuration no importa tipos internos de Invoices ni conoce factura/documentos. Invoices no accede a functional_parameters directamente. Conservar transactionContext opaco hasta infraestructura, no importar Mongoose en application. No nuevas dependencias externas necesarias.

### Concurrencia y reloj al confirmar

La actualización administrativa revalida policyVersion y autoridad global dentro de la transacción. El rol APP_ADMIN conserva el modelo de validez JWT actual; no se promete revocación externa instantánea.

El participante de Configuration confirma revisión/ámbito con una escritura condicional que incrementa mutationFence en el documento actual, usando la misma sesión MongoDB de Invoice. Cambios administrativos escriben ese mismo documento, serializando las dos operaciones. Una lectura snapshot por sí sola permitiría escritura sesgada y se descarta como garantía.

Invoices vuelve a evaluar su propia ventana con reloj de servidor dentro de la transacción después de confirmar la política y antes de escribir la factura. Configuration solo confirma revisión/vigencia; no asume reglas de factura. Reintentos transaccionales vuelven a evaluar la hora. Evidencia reemplazada produce EDIT_POLICY_UNAVAILABLE 503 con recuperación mediante nueva lectura; versión administrativa obsoleta produce 409 PARAMETER_VERSION_CONFLICT.

Este instante de evaluación es el punto de decisión dentro de la transacción, no una promesa de reloj exacto de confirmación física de MongoDB. Pruebas con barreras deben demostrar el orden observable de actualización y edición. El fence global serializa ediciones dependientes; se acepta el costo inicial por consistencia, con medición y revisión si hay volumen elevado.

### API y autorización

GET /api/parameters: q, page, pageSize 1–100, sort key/name/updatedAt, direction; conteo previo a paginación sobre catálogo inicializado. GET /api/parameters/{key}: detalle. GET /api/parameters/{key}/history: historial paginado protegido por parameters:read. PATCH /api/parameters/{key}: {expectedVersion,value} estricto. Todos exigen scope=global, token Bearer y permisos globales actuales; rechazan IDs organizacionales.

No POST/DELETE/desactivación pública. Clave conocida sin inicializar no se inventa en listado; detalle 404 PARAMETER_NOT_INITIALIZED; lector interno UNAVAILABLE. Clave desconocida 404 neutral tras permiso. Errores 400 formato/rango, 401 sesión, 403 autoridad/contexto, 404 ausente, 409 versión, 503 proveedor/auditoría, 500 inesperado neutro. Respuestas no-store y OpenAPI 3.1. Cambio sin efecto requiere autorización y versión vigente pero no nueva versión/evento.

### Interfaz reutilizable

Reemplazar marcador /parameters con guard global, no confiar en metadata context=active. Reutilizar DataTable/Surface/Action/SortHeader, DataPagination, TableLoadingState, Dialog, SuccessNotice, errores y tema global. Tabla: nombre, clave, valor/unidad, ámbito, actualización y acciones; tarjetas equivalentes móvil. Filtros con borradores/chips y aplicación explícita; son útiles aunque hoy exista una sola fila.

Detalle muestra descripción/rango/vigencia/versión. Diálogo de edición: nombre y ámbito solo lectura, valor actual, nuevo valor en segundos y equivalencia, aviso sobre efecto en facturas existentes; confirmación explícita. Un campo editable a todo ancho en móvil, actual/nuevo en paralelo escritorio, aviso a todo ancho y acciones visibles. Historial muestra actor técnico, instante, anterior/nuevo y revisión. No agregar botón Crear o Desactivar.

Cambios de contexto/permisos cancelan peticiones, limpian borradores y descartan respuestas obsoletas; error 409 conserva borrador e invita a recargar sin sobrescribir valores ajenos. Se evita doble envío y se prueba foco/teclado a 360/1280 px.

## Risks / Trade-offs

- [Parámetro no inicializado] → inventario e inicializador explícitos; UI informa ausencia, Facturas conserva 503 hasta resolver.
- [Cambio global modifica elegibilidad anterior] → aviso previo y pruebas de ampliación/reducción, sin mutación masiva de facturas.
- [Fence compartido limita concurrencia] → pruebas de contención, reintentos acotados y métricas; no retirar garantía para optimizar sin diseño posterior.
- [QR en código con tareas OpenSpec pendientes] → verificar regresión y conservar QR_IMMUTABLE; no archivar ni dar por completado otro cambio.
- [Confusión con secretos] → catálogo cerrado y rechazo de campos/claves desconocidas; documentación separa parámetros y entorno técnico.

## Migration Plan

Inventario solo lectura de functional_parameters/configuration_events antes de crear índices. Reportar claves desconocidas, inválidas o duplicadas sin reparar automáticamente. Inicializador técnico explícito con actor/correlación instala únicamente ausentes usando 43200 y evento transaccional, preserva existentes válidos y aborta ante conflicto. Ensayar idempotencia y fallos en replica set de prueba. Documentar futuros comandos parameters:inventory y parameters:init; no ejecutarlos durante la propuesta.

Después de inicializar, sustituir ambos adaptadores pendientes en invoice-endpoint, comprobar edición real MANUAL con el valor persistido y rechazo QR. Rollback puede volver al proveedor UNAVAILABLE para cerrar edición, conservando datos e historial; restaurar valor anterior es nueva actualización versionada, nunca borrar eventos ni restablecer 12 horas silenciosamente.
