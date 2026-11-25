# Verificación de captura offline de facturas

Este documento reúne las pruebas focalizadas y sus prerrequisitos para el cambio `offline-invoice-sync`. Las pruebas de MongoDB usan un replica set desechable independiente del MongoDB funcional de la aplicación.

## Requisitos

- Node.js 24.15.x y npm 11.x.
- Docker Desktop/Engine con Docker Compose v2 para la integración MongoDB.
- Chromium de Playwright para las pruebas E2E.
- Dependencias instaladas con `npm --prefix backend ci` y `npm --prefix frontend ci`.

## Pruebas unitarias

Desde la raíz del repositorio:

```powershell
npm --prefix backend run test -- tests/unit/offline-credential.test.ts tests/unit/offline-invoice-submissions.test.ts tests/unit/invoice-submission-domain.test.ts tests/unit/invoice-submission-repository.test.ts tests/unit/submission-image-storage.test.ts tests/unit/invoice-sync-retention.test.ts
npm --prefix frontend run test -- tests/unit/offline-credential.test.ts tests/unit/offline-invoice-sync.test.ts tests/unit/offline-invoice-queue.test.ts tests/unit/offline-invoice-capture-page.test.tsx tests/unit/offline-invoice-lifecycle.test.ts
```

La cobertura frontend verifica captura MANUAL/QR, retención del texto QR original, aislamiento por sujeto y tercero, imágenes Blob, clave idempotente, cuota, vencimiento de credencial, limpieza por sesión y ausencia de sincronización cruzada.

## Integración transaccional MongoDB

Iniciar un MongoDB con replica set y almacenamiento temporal:

```powershell
$env:MONGO_TEST_PORT = '27019'
docker compose -f compose.test-mongodb.yaml up -d --wait
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:27019/offline_invoice_sync_test?replicaSet=invoice-tests-rs&directConnection=true'
npm --prefix backend run test:integration:offline-invoice-sync
```

La suite comprueba la creación atómica de factura, imagen, resultado del envío y outbox; el rollback ante versión obsoleta; y la idempotencia ante reintentos. La URI debe incluir una base terminada en `_test`. Cada ejecución crea una base aleatoria `invoice_management_<id>_test` y la elimina al cerrar. El contenedor de prueba usa `tmpfs`, no monta el volumen de datos funcional y puede detenerse con:

```powershell
docker compose -f compose.test-mongodb.yaml down
```

Si el puerto 27019 está ocupado, selecciona otro `MONGO_TEST_PORT` y usa ese puerto en `MONGODB_TEST_URI`.

## E2E en navegador

Instalar Chromium una vez (requiere acceso a la descarga de Playwright):

```powershell
npm --prefix frontend run test:e2e:install
```

Ejecutar captura offline y resolución administrativa:

```powershell
npm --prefix frontend run test:e2e:offline-invoice-sync -- --workers=1
```

Playwright inicia Vite automáticamente. La prueba offline abre primero el formulario, simula la pérdida de conexión, captura y guarda sin llamadas `/api`, y confirma que IndexedDB conserva el registro al recargar. El QR del harness usa un decodificador simulado y conserva texto que no se puede interpretar localmente; esto comprueba el flujo UI, no la cámara física ni una inspección tributaria del QR. Los casos de administración prueban vincular duplicados, aprobar asignaciones cerradas, rechazar y pedir actualización ante versiones obsoletas.

Probar el shell de producción, la caída de red con la aplicación abierta y el lector QR real incluso después de recargar sin conexión:

```powershell
npm --prefix frontend run test:e2e:offline-shell -- --workers=1
```

Esta prueba construye entradas E2E separadas, crea una credencial ES256 efímera para el navegador y levanta `vite preview`. La clave privada se guarda temporalmente en `frontend/test-results` para compartirla entre el build y el worker de Playwright; el `globalTeardown` la elimina. El artefacto de build de esta prueba no se debe desplegar. El lector procesa una imagen PNG de QR generada para la prueba; no requiere cámara ni validación fiscal real. La prueba también comprueba que, al recuperar la red, se abandona la vista offline y se carga de nuevo el shell normal.

## Verificación general

```powershell
npm --prefix frontend run check
npm --prefix backend run check
npm --prefix backend run openapi:lint
openspec validate offline-invoice-sync --type change --strict
```

`check` ejecuta lint, TypeScript, pruebas unitarias y arquitectura. Los resultados de una ejecución deben anotarse junto al cambio, incluidos los fallos ya existentes fuera del flujo offline; una suite focalizada verde no sustituye el chequeo general.

## Estado de esta revisión

Al 24 de noviembre de 2026, OpenSpec registra 34/34 tareas completas. La integración de repositorio MongoDB pasó 16/16 pruebas; la suite E2E de captura offline/resolución administrativa pasó 9/9; y la E2E de shell de producción, cambio automático al perder red y QR real después de recargar offline pasó 1/1.

En la validación integral final, `npm run check` pasó en frontend: lint sin errores (13 avisos), TypeScript, 42 archivos con 240 pruebas y arquitectura. También pasó en backend: lint sin errores (9 avisos), TypeScript, 61 archivos con 542 pruebas aprobadas y 1 omitida, y arquitectura. Pasaron además `npm run openapi:lint`, `openspec validate offline-invoice-sync --type change --strict`, y las pruebas focalizadas de regresión de permisos/contexto (32/32) y de los módulos afectados (48/48).

Se intentó repetir Playwright después de los arreglos, pero el proceso no inició ni reportó casos durante varios minutos y se interrumpió manualmente. Las ejecuciones E2E previas documentadas arriba pasaron; el intento interrumpido no se cuenta como una nueva aprobación.

El 24 de noviembre de 2026 se corrigió una regresión reportada en la pantalla de facturas: un error temporal `NETWORK`/`TIMEOUT` al renovar permisos ya no borra la última decisión verificada del mismo contexto ni desmonta la navegación. Se muestra un aviso, se reintenta con espera creciente y, si el servidor responde después con permisos revocados, el contexto vuelve a bloquearse inmediatamente. La regresión quedó incluida en la suite frontend completa y en las pruebas focalizadas anteriores.

Para esta revisión se levantó el Compose MongoDB con un puerto libre (57904) y se retiró al terminar. Chromium de Playwright se instaló en `frontend/node_modules` (ignorado por Git), y se retiró también el servidor temporal que lanzó Playwright.

En la revisión final se movió la cola local a la pestaña `Pendientes (n)`, visible solo cuando hay registros que requieren acción, y se dejó la captura en una pestaña separada. El historial del administrador tercero ahora muestra el nombre de conductor y la placa del vehículo de la asignación sin exponer el sujeto interno. La tabla desktop conserva paginación y el historial usa presentación responsive.

Las pruebas focalizadas de esta revisión pasaron: frontend, 20/20; backend, 14/14. También pasaron TypeScript en ambos proyectos, ESLint sobre los archivos afectados, `npm run openapi:lint` y `git diff --check`.
