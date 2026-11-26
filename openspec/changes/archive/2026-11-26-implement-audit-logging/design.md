# Design

## Context

Véase [proposal.md](proposal.md) para la motivación y [specs/audit/spec.md](specs/audit/spec.md) para los requisitos. El módulo Audit ya normaliza eventos, escribe de forma idempotente en `audit_events`, conserva dos años y admite una sesión Mongo opcional. Actualmente acepta `authorization`, `organizations` y `keycloak-admin`. Organizations/contexto, algunas operaciones de invitaciones y políticas usan el writer compartido; facturas, asignaciones, gestión de vehículo/conductor y catálogos conservan colecciones locales. Company y Third Party registran eventos locales con `delivered: false`, pero no se encontró un consumidor de ese estado. El journal no tiene endpoint de consulta.

## Goals / Non-Goals

**Goals:** completar productores centrales para las mutaciones aprobadas; preservar atomicidad, idempotencia, privacidad y las consultas funcionales actuales; hacer recuperable cualquier captura local pendiente; dejar explícita la cobertura que se verifica en cada módulo.

**Non-Goals:** habilitar lectura transversal o `audit:read`; reemplazar historiales locales; reescribir la política aprobada de dos años; recopilar todos los cambios de Keycloak en producción; guardar snapshots completos de entidades o solicitudes; agregar broker externo, nuevos permisos o cambios funcionales de negocio.

## Decisions

### Una traducción explícita por productor

Ampliar el conjunto cerrado de `source` y definir mapeos específicos desde eventos de cada productor. El mapeo genera IDs estables, acciones controladas, actor verificado, instante UTC, correlación, ámbito/recurso y versiones disponibles. No copiar documentos Mongo, imágenes, payloads, valores personales completos ni claims. En catálogos y configuración se conservarán sus detalles tipados en los historiales locales; el evento transversal llevará solo los hechos permitidos por su contrato.

**Alternativa considerada:** aceptar objetos de evento genéricos o persistir payloads completos. Se descarta porque permitiría filtrar datos sensibles y acoplar el journal a los modelos internos.

### Atomicidad en la transacción propietaria

Para productores que ya confirman mutación y evento local en una transacción Mongo, escribir el hecho central con la misma sesión antes del commit. El bootstrap compone los adaptadores; los casos de uso mantienen puertos pequeños y no conocen el esquema de `audit_events`. La respuesta de éxito se emite solo después del commit de ambos registros.

**Alternativa considerada:** publicar después del commit sin outbox. Se descarta porque una caída entre commit y entrega perdería evidencia central.

### Entrega durable cuando ya existe una captura pendiente

Procesar los eventos Company/Third Party que actualmente quedan con `delivered: false` mediante un worker de lote acotado. El worker usa el ID existente al escribir en Audit y solo marca la captura como entregada después de aceptar el mismo evento; una repetición queda cubierta por la idempotencia central. Las capturas pendientes preexistentes se entregan antes de declarar completa la cobertura. Los productores transaccionales restantes escriben en línea; no se crea una segunda cola para ellos.

**Alternativa considerada:** mantener un worker genérico para todos los módulos. Se descarta inicialmente porque agregaría una cola y coordinación adicional donde la transacción Mongo existente permite atomicidad directa.

### Historial local y journal central tienen propósitos distintos

Conservar `invoice_events`, `assignment_events`, `driver_management_events`, `vehicle_management_events`, eventos de invitación, configuración y catálogos donde sostengan vistas o decisiones actuales. El journal central contiene referencias y hechos mínimos para trazabilidad común; no alimenta endpoints ni reemplaza consultas locales. El proyecto continúa en desarrollo y el usuario confirma que no hay datos históricos que migrar: no se planifica backfill ni migración de eventos anteriores. El worker cubre únicamente los eventos nuevos generados desde que se habilite la captura.

**Alternativa considerada:** eliminar colecciones locales y migrar todos sus registros al journal. Se descarta porque mezclaría retenciones y contratos de consulta distintos y ampliaría el riesgo de migración.

### Orden de integración por módulos

Conectar productores en fases revisables: Organizations (incluidos Company/Third Party y outbox pendiente), Fleet (Driver, Vehicle, Assignment), Invoices e Invoice Sync, Configuration y Parametric Catalogs. Cada fase conserva el estado de negocio y prueba transacción, IDs, sanitización y fallos antes de avanzar. La retención y el índice TTL existentes no se modifican.

### Las consultas permanecen cerradas

No crear handler REST, documentación de endpoint, permiso de lectura ni pantalla para `audit_events`. La UI de auditoría que aparece en prototipos no concede autorización ni altera la especificación de privacidad.

## Risks / Trade-offs

- [Ampliar productores puede cambiar latencia de escrituras] → Usar la transacción ya existente, medir su costo y evitar lecturas posteriores redundantes en el writer cuando la sesión y la inserción permitan confirmar el resultado.
- [Los mapeos por módulo pueden divergir] → Mantener tablas de acciones y pruebas de contrato que validen actor, scope, recurso, correlación, campos permitidos e ID estable.
- [El outbox Company/Third Party puede contener registros antiguos incompatibles] → Inventariar y validar la cola antes de activar el worker; no descartar ni marcar entregado un evento inválido. Detener entrega y reportar el ID técnico sin exponer su payload.
- [La captura central reduce disponibilidad de mutaciones] → Para productores transaccionales se falla cerrado, coherente con sus especificaciones; para entregas diferidas se permite el éxito solo tras captura durable.
- [Las colecciones locales y centrales duplican hechos] → Documentar que son proyecciones con propósitos distintos, compartir `eventId` y evitar duplicar detalles sensibles.

## Migration Plan

1. Preparar el outbox para eventos nuevos de `company_management_events` y `third_party_management_events`, y verificar topología transaccional Mongo en los entornos objetivo; no ejecutar inventario o backfill histórico porque no hay datos que migrar.
2. Extender el validador y writer compartidos sin cambiar el formato ya aceptado por sus productores actuales.
3. Conectar y probar la entrega de nuevas capturas con reintento por `eventId`; usar fixtures aisladas para simular reinicios, duplicados y eventos inválidos.
4. Incorporar cada productor transaccional al writer común usando su sesión existente; conservar colecciones e índices locales y desplegar la captura antes de reportar completa cada fase.
5. Observar conteos de entregados, pendientes, reintentos y errores sin registrar contenido de eventos. En rollback detener workers y restaurar el adaptador anterior solo si no vuelve a permitir éxitos sin captura durable; conservar capturas pendientes para reanudación.
6. No migrar historiales locales ni cambiar la expiración central de dos años. El cambio registra operaciones nuevas desde su activación.

## Open Questions

Ninguna que cambie el alcance aprobado. La solución no requiere migración histórica; el desarrollo del worker debe validar errores con fixtures y no con datos existentes.
