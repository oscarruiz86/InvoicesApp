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

Un cambio efectivo y su evento (`configuration_events`) se confirman en una misma transacción. La actualización vuelve a confirmar `policyVersion` de autorización en esa misma transacción; una revocación o cambio concurrente no puede confirmar una escritura basada en permisos obsoletos. Un no-op conserva versión e historial. La edición de factura confirma la revisión mediante `mutationFence` en el documento del parámetro dentro de la sesión Mongo compartida; después evalúa nuevamente el límite exclusivo usando reloj de servidor.

## Composición

`configuration/domain` contiene el catálogo e invariantes; `application` expone DTO y contratos internos; `infrastructure/mongodb` es el único dueño de `functional_parameters` y `configuration_events`; `presentation` valida la API. El bootstrap proporciona a Invoices adaptadores de lectura de política global y confirmación transaccional. Invoices no importa el repositorio ni lee colecciones de Configuration.

## Interfaz

`/parameters` exige contexto global y permiso de lectura. La tabla de escritorio y las tarjetas móviles reutilizan los componentes compartidos. El detalle muestra descripción, rango, vigencia y revisión; el historial muestra actor, fecha, valores y versiones. Quien tenga `parameters:update` puede abrir el diálogo, revisar el valor actual/nuevo, unidad, equivalencia en horas y efecto en facturas existentes, y confirmar el cambio. La UI conserva el borrador ante conflictos, bloquea envíos duplicados y elimina datos/detalles pendientes al perder contexto o permiso. No permite crear o desactivar claves.

## Verificación local

Las pruebas de contrato, persistencia y concurrencia viven en `backend/tests/unit` y `backend/tests/integration`; la suite Mongo necesita una replica set y una URI a una base aislada cuyo nombre termine en `_test`. Los escenarios de interfaz están en `frontend/tests/unit/parameters-page.test.tsx` y `frontend/tests/e2e/parameter-management-responsive.spec.ts`, que ejercita teclado y viewport de 360/1280 px.

```powershell
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/parameter_management_test?replicaSet=<replica>&directConnection=true'
npm --prefix backend run test:integration -- --pool=forks --maxWorkers=1 tests/integration/configuration-parameters.test.ts tests/integration/invoice-repository.test.ts
npm --prefix backend run parameters:inventory
$env:PARAMETERS_INIT_ACTOR = 'technical:operator'
npm --prefix backend run parameters:init
npm --prefix frontend run test:e2e -- tests/e2e/parameter-management-responsive.spec.ts --workers=1
```

Los comandos administrativos usan `MONGODB_URI`/`MONGODB_URI_FILE`, no `MONGODB_TEST_URI`; para ensayarlos, apunta explícitamente `MONGODB_URI` a una base temporal terminada en `_test` y verifica el destino antes de ejecutar `parameters:init`. No los ejecutes en producción como parte del arranque del backend.
