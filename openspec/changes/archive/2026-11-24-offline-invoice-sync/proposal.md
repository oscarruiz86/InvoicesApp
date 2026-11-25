# Proposal

## Why

Los conductores pueden quedar sin cobertura mientras registran facturas, lo que impide completar el flujo y puede causar pérdida de información. La captura local con sincronización posterior permitirá continuar trabajando y hará visible qué registros llegaron al servidor y cuáles requieren decisión administrativa.

## What Changes

- Permitir abrir la aplicación previamente instalada, capturar facturas manuales o QR y guardar sus datos e imágenes en el dispositivo cuando no haya conexión.
- Habilitar esa captura solo con una credencial offline firmada por el servidor, de alcance limitado al conductor, tercero, asignaciones disponibles y captura local, con vigencia máxima de 8 horas; la credencial no autoriza llamadas al backend.
- Sincronizar automáticamente los registros pendientes al recuperar conexión, con reintentos seguros e idempotencia.
- Mostrar al conductor estados de guardado local, envío, corrección requerida, sincronización, rechazo y conflicto.
- Separar la cola de trabajo local del historial del servidor: la cola muestra solo registros que requieren acción o reintento; los registros rechazados, sincronizados, vinculados o resueltos se consultan en un historial propio, durable y paginado.
- Permitir al conductor consultar el detalle de sus envíos, incluidos estado final, motivo, resolución administrativa y factura resultante cuando exista.
- Identificar en las facturas registradas las que se originaron en una captura offline.
- Presentar la cola local y el historial de sincronización en tablas paginadas para facilitar la consulta desde escritorio y móvil.
- Separar la captura offline y la cola pendiente en pestañas; mostrar la pestaña de pendientes solo cuando existan registros que requieran acción.
- Mostrar al administrador tercero el nombre del conductor y la placa del vehículo asociados a cada envío en el historial, sin exponer identificadores internos del conductor.
- Mostrar al administrador la bandeja de revisión solo cuando existan conflictos pendientes y abrir su contenido en un modal paginado.
- Registrar conflictos de sincronización sin descartar el contenido enviado y permitir su resolución únicamente por un `THIRD_PARTY_ADMIN` autorizado del tercero correspondiente.
- Mantener adjuntos de envíos no resueltos en almacenamiento temporal, con limpieza controlada, y auditar la decisión administrativa.

## Capabilities

### New Capabilities
- `invoice-sync`: Cola de facturas offline, sincronización diferida, visibilidad de estado y gestión de conflictos.

### Modified Capabilities
- `invoice-management`: Permitir que la captura de una factura se complete offline y aceptar su posterior presentación al servidor, manteniendo validaciones de negocio, autorización e idempotencia.

## Impact

Afecta al frontend de facturas, su caché de aplicación y persistencia local; a la API, casos de uso, almacenamiento temporal de imágenes y repositorio de facturas en backend; a la autorización de `THIRD_PARTY_ADMIN`; al registro de auditoría y al contrato OpenAPI. Las imágenes pendientes deben conservarse localmente hasta confirmación o resultado terminal. Las facturas existentes se interpretan como capturadas en línea si todavía no tienen el nuevo indicador de canal.
