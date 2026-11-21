# Configuration: parámetros funcionales

## Catálogo

| Clave | Uso | Tipo y unidad | Rango | Inicial |
| --- | --- | --- | --- | --- |
| `invoice.manual-edit-window-seconds` | Ventana de edición de facturas manuales desde `createdAt` | Entero, segundos | 1–31.536.000 (365 días) | 43.200 (12 horas) |

Nombre, descripción, tipo, unidad, rango y ámbito global están fijados en código. La API solo permite actualizar el valor mediante `expectedVersion`; no hay alta ni baja. La duración vigente también se aplica a facturas existentes, conserva sus fechas y no habilita facturas QR.

## Preparación y operación

Antes del despliegue, configura una conexión MongoDB al replica set aislado del entorno y ejecuta `npm --prefix backend run parameters:inventory`. El inventario es de solo lectura y reporta claves desconocidas, duplicados y valores incompatibles. No corrige datos.

Configura `MONGODB_URI` (o el mecanismo de secreto `MONGODB_URI_FILE`) y `PARAMETERS_INIT_ACTOR` con un identificador técnico trazable. Ejecuta explícitamente `npm --prefix backend run parameters:init`. La operación requiere transacciones MongoDB, instala solo la clave ausente con valor inicial y evento, y puede repetirse sin reemplazar un valor existente. No ejecutes la inicialización al atender lecturas.

Si el inventario no está limpio, resuelve los datos mediante el procedimiento operativo aprobado antes de habilitar la API. No borres eventos para reparar el estado. En una reversión funcional, despliega la versión previa para devolver la edición a `EDIT_POLICY_UNAVAILABLE`; conserva parámetro e historial. Restaurar un valor es una nueva actualización versionada.

## API y permisos

Las rutas requieren Bearer y `scope=global`. APP_ADMIN con `parameters:read` puede usar `GET /api/parameters`, `GET /api/parameters/{key}` y `GET /api/parameters/{key}/history`. APP_ADMIN con `parameters:update` puede usar `PATCH /api/parameters/{key}` con `{ "expectedVersion": 1, "value": 21600 }`. La API devuelve 400 para solicitudes o valores inválidos, 401/403 para autenticación y autorización, 404 para clave ausente/desconocida, 409 para versión obsoleta y 503 si no se puede confirmar el valor efectivo. Las respuestas llevan `Cache-Control: no-store`.

Un cambio efectivo y su evento (`configuration_events`) se confirman en una misma transacción. Un no-op conserva versión e historial. La edición de factura confirma la revisión mediante `mutationFence` en el documento del parámetro dentro de la sesión Mongo compartida; después evalúa nuevamente el límite exclusivo usando reloj de servidor.

## Composición

`configuration/domain` contiene el catálogo e invariantes; `application` expone DTO y contratos internos; `infrastructure/mongodb` es el único dueño de `functional_parameters` y `configuration_events`; `presentation` valida la API. El bootstrap proporciona a Invoices adaptadores de lectura de política global y confirmación transaccional. Invoices no importa el repositorio ni lee colecciones de Configuration.

## Interfaz

`/parameters` exige contexto global y permiso de lectura. Presenta valor, unidad, versión, historial y, para `parameters:update`, diálogo de cambio con rango y aviso del efecto en facturas ya creadas. No permite crear o desactivar claves.
