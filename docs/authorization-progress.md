# Implementación de autorización

El usuario autorizó implementar `implement-authorization` mediante `$openspec-apply-change implement-authorization` el 2026-11-09. La autorización comprende el núcleo, contratos, política, consulta REST y controles frontend de ese cambio. Los permisos pendientes permanecen denegados. No incluye CRUD de negocio, selector organizacional, despliegue, archivo ni sincronización de otros cambios.

Estado verificado al cierre del 2026-11-10: **24/32 tareas completadas**. Quedan abiertas 3.5, 6.1–6.6 y 7.2 por las dependencias reales descritas al final. El cambio permanece en progreso.

## Evidencia de aceptación — 2026-11-10

| Criterios | Evidencia ejecutada y límite |
| --- | --- |
| A1, A2, A5 | Matriz parametrizada, regresión JWT, inventario de rutas y wrappers. HTTP real verifica 401, `/me` 200, snapshot DRIVER propio 200, ámbito global 403, petición inválida 400 y proveedor organizacional ausente 503. |
| A3, A4, A6 | Contratos de asociaciones y aislamiento con fixtures; integración real, listados/conteos y revocación pendientes de Organizations y los propietarios de recursos. |
| A7 | Store, guards, menú, cancelación, caducidad y sesión comprobados con Vitest. El selector real y su prueba Playwright A→B siguen pendientes. Las pruebas existentes de navegador cubren regresión del shell y Swagger, no autorización organizacional integrada. |
| A8, A9 | Puertos sustituibles, `check` sin servicios en ambas aplicaciones y casos negativos de frameworks, imports entre aplicaciones, ciclos y persistencia de otro contexto. |
| A10 | Lint OpenAPI 3.1 válido, DTO cerrado, contrato y respuestas HTTP reales. Swagger y assets locales conservados. |
| A11 | Dobles demuestran rechazo antes de invocar escrituras. MongoDB real comprueba revisión única concurrente, captura atómica y estado inalterado al rechazar políticas inválidas o buffer lleno. Las escrituras de negocio requieren la unidad de confirmación real de sus propietarios. |
| A12 | JWT viejo/nuevo con reloj controlado, rerelectura de política/asociación y renovación/caducidad frontend. MongoDB verifica revisión persistida; revocación organizacional y confirmación concurrente de negocio pendientes. |

## Verificaciones reproducibles

- `npm --prefix backend run check` y `npm --prefix frontend run check`: lint, TypeScript, pruebas unitarias y controles de arquitectura correctos; 232 pruebas backend y 55 frontend. El frontend usa un único thread aislado.
- `npm --prefix backend run build` y `npm --prefix frontend run build`: correctos. Vite informa un chunk de aproximadamente 550 kB; no impide la compilación.
- `npm --prefix backend run openapi:lint`: contrato válido.
- `MONGODB_TEST_URI=mongodb://127.0.0.1:27019/invoices_authorization_test` con `npm --prefix backend run test:integration`: 2 pruebas correctas. La prueba de política crea y elimina exclusivamente su base aleatoria propia.
- `npm --prefix backend run authorization:init`: comprobado contra `invoices_authorization_init_test`, con revisión inicial 1. La integración comprueba que repetir la inicialización conserva revisiones existentes. No se inicializó ni migró una base funcional por inferencia.
- `AUTHORIZATION_TEST_MONGODB_URI=mongodb://127.0.0.1:27019/invoices_authorization_init_test` con `npm --prefix backend run test:http`: correcto sobre la política aislada inicializada. Los casos de health/docs/OpenAPI/configuración usan el build standalone; JWT y permisos usan Next dev con JWKS local y claves efímeras, conservando la exigencia de HTTPS en producción.
- `npm --prefix frontend run test:e2e`: 4 pruebas Playwright correctas (360/1280 px, recuperación de API y Swagger real mediante proxy). Se repitió la ejecución con backend disponible y terminó correctamente.
- `openspec validate implement-authorization --strict --no-interactive`: cambio válido. La revisión de los archivos del incremento no encontró claves privadas ni JWT Bearer embebidos.

Las variables anteriores se establecen en el entorno de la ejecución; no son archivos de configuración nuevos. Al retomar la sesión, MongoDB y backend estaban apagados y provocaron ECONNREFUSED. Se inició el Docker Desktop existente y se arrancaron los contenedores locales sin recrear ni borrar volúmenes; la integración y HTTP se repitieron satisfactoriamente.

## Dependencias pendientes

Audit no tiene adaptador real; Organizations, Fleet, Invoices y Configuration aún no proporcionan los recursos funcionales. Las tareas 3.5 y 6.1–6.6 no se pueden completar con dobles. Su ausencia no amplía el alcance y no impide avanzar con tareas independientes. No declarar aceptación integrada completa mientras falten estas dependencias.

La tarea 7.2 permanece abierta porque exige A1–A12 integrados, aunque las verificaciones disponibles hayan pasado. Primero deben entregarse asociaciones/contexto y selector en `implement-organization-context`, recursos y confirmación concurrente en sus módulos, y entrega/recolección real en Audit. No se añadieron CRUD, selector provisional, configuración administrativa de Keycloak, secretos ni dependencias instaladas; tampoco se sincronizaron o archivaron otros cambios.
