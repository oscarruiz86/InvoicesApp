# Diseño (Design)

## Contexto (Context)

Consulta [proposal.md](proposal.md). La autorización almacena los hechos aceptados de cambios de política en `authorization_policies.pendingEvents`; Organizations y los módulos de negocio actualmente escriben en colecciones de eventos específicas de cada módulo. El nuevo contrato debe preservar las garantías transaccionales existentes y evitar introducir un broker o una API de historial de auditoría. El usuario fijó la retención en dos años.

## Objetivos y fuera de alcance (Goals / Non-Goals)

**Objetivos:** ofrecer un único destino de auditoría depurado y de solo anexado; hacer idempotentes los IDs de evento; entregar los eventos de política capturados después de reinicios del proceso; conservar los registros durante dos años; canalizar los cambios de asociaciones por el mismo destino.

**Fuera de alcance:** exponer lecturas de auditoría, conceder `audit:read`, cambiar decisiones de autorización, centralizar en este incremento todas las colecciones históricas de negocio o añadir un broker de mensajes.

## Decisiones (Decisions)

### Contrato y validación de eventos

Definir un puerto pequeño de aplicación y un sobre normalizado de evento: `eventId` estable, `occurredAt`, origen, tipo/subject del actor verificado, acción, resultado, motivo categórico, ID de correlación, ámbito organizacional validado opcional, tipo/ID de recurso seguros y revisiones anterior/posterior opcionales. Rechazar campos desconocidos e identificadores inseguros. No almacenar credenciales, tokens, claims sin procesar, cuerpos de solicitudes del cliente ni representaciones de eventos del proveedor. La ingesta de Keycloak asigna únicamente campos administrativos permitidos a este sobre en su cambio independiente.

### Registro MongoDB de solo anexado

Usar una colección dedicada `audit_events` con un índice único sobre `eventId` y una fecha de expiración igual a `occurredAt + 730 days`. Insertar con `$setOnInsert`; un reintento con el mismo ID de evento y los mismos hechos canónicos se acepta de forma idempotente, mientras que hechos distintos para ese ID constituyen un conflicto de integridad. La expiración TTL de MongoDB puede ejecutarse después del límite exacto, pero nunca debe eliminar un evento antes de tiempo. Los participantes transaccionales existentes de cada módulo pueden escribir mediante el contrato usando la misma sesión Mongo, de modo que la escritura de negocio y la captura de auditoría sigan siendo atómicas.

### Entrega de eventos de política mediante outbox

Mantener `pendingEvents` en el documento de política porque la versión de la política y su captura ya se confirman atómicamente allí. Un worker lee un lote acotado, escribe cada evento en Audit y luego elimina del documento de política únicamente el ID de ese evento. Si el proceso falla entre la inserción en el registro y el `$pull`, el reintento queda cubierto por el ID único del evento. Si falla la escritura en el registro, el outbox permanece intacto. No hay un cursor de entrega separado que pueda adelantarse al evento durable.

### Ciclo de vida del worker

Proporcionar un comando de worker dedicado y acotado, con apagado ordenado, espera incremental ante la indisponibilidad de MongoDB y conteos estructurados de eventos entregados/reintentados que nunca incluyan el contenido de los eventos. Se ejecuta independientemente de los controladores de solicitudes; ninguna actualización de política espera a que el servicio Audit esté disponible una vez capturado el evento en el outbox durable.

### Retención de dos años y privacidad

El TTL se basa en la marca de tiempo de ocurrencia del evento validada por el servidor y usa el periodo aprobado por el usuario de 730 días. No se añade un endpoint de borrado ni un script de purga manual. El historial de Audit permanece inaccesible para los usuarios de la aplicación mientras `audit:read` no esté concedido. Las pruebas de almacenamiento e índices usan únicamente bases de datos `_test` aisladas.

## Riesgos y compensaciones (Risks / Trade-offs)

- [La eliminación TTL es asíncrona] → Se garantiza que los registros no expiren antes de tiempo; la documentación operativa indica que MongoDB puede eliminarlos después del límite de dos años, no necesariamente justo al alcanzarlo.
- [El outbox de políticas puede crecer mientras Audit no esté disponible] → Limitar cada lote de entrega, exponer conteos, conservar los eventos y detenerse de forma segura al alcanzar la capacidad existente del outbox, en vez de descartarlos.
- [Los distintos formatos de evento de los productores pueden filtrar datos sensibles] → Usar un esquema normalizado estricto y mappers específicos por origen; no persistir objetos genéricos de payload.
- [No hay una API de historial disponible] → Esto conserva deliberadamente el permiso `audit:read` denegado hasta que exista una política de consulta aprobada por separado.

## Plan de migración (Migration Plan)

Crear la colección y los índices de forma idempotente cuando se inicialicen el worker/adaptadores de Audit. No reescribir ni eliminar las colecciones de eventos existentes de los módulos. Desplegar el worker de Audit antes de conectar productores con entrega diferida; para revertir, detener el worker y conservar los eventos de política pendientes para una entrega posterior. No se migra ningún realm activo ni ningún registro de auditoría existente.
