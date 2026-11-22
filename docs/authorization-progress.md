# Implementación de autorización

El usuario autorizó implementar `implement-authorization` mediante `$openspec-apply-change implement-authorization` el 2026-11-09. La autorización comprende el núcleo, contratos, política, consulta REST y controles frontend de ese cambio. Los permisos pendientes permanecen denegados. No incluye CRUD de negocio, selector organizacional, despliegue, archivo ni sincronización de otros cambios.

Estado de la revisión anterior (2026-11-10): **24/32 tareas completadas**. La actualización del 2026-11-22 está registrada al final; el cambio permanece en progreso por las tareas de Audit y aceptación completa.

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

## Actualización de aceptación — 2026-11-22

Las integraciones reales de Organizations, Fleet, Invoices y Configuration ya están disponibles. Las tareas 6.1–6.5 se completaron con fixtures MongoDB, filtros reales, evidencia de asignación y revocación previa a la confirmación. Para 6.2, Playwright ejecuta el `createContextStore` y los componentes reales del selector.

| Verificación | Resultado |
| --- | --- |
| `npm --prefix backend run test:integration:prepared` | 17 suites, 75/75 pruebas; MongoDB y Keycloak desechables. Incluye asociaciones/contexto, recursos por tercero, rechazo de asignación cruzada, factura/QR y membresía revocada antes de confirmar. |
| `npm --prefix backend run test:http:prepared` | HTTP Next real, JWT, OpenAPI/Swagger, autorización y vehículos aprobados; `Cache-Control: no-store`, errores y filtros comprobados. El harness ya valida seguridad/DTO de `/api/invoices` implementado en vez de esperar 404. |
| `npm --prefix frontend run test:e2e:prepared` | 41/41 Playwright. Los 3 escenarios nuevos verifican A→B con borrado de datos, resolución tardía B frente a C y rechazo de contexto. |
| Builds backend/frontend y OpenAPI | Next.js build, Vite build y `openapi:lint` pasan. Vite informa el bundle principal de 1.035,25 kB sobre el aviso predeterminado de 500 kB. |
| `openspec validate implement-authorization --strict --no-interactive` | Válido después de la actualización de tareas. |

## Dependencias aún pendientes

Audit transversal aún no tiene adaptador real de entrega/consulta ni política de retención aprobada. Por ello permanecen abiertas 3.5 (entrega/reintento idempotente a Audit), 6.6 (recolección de eventos administrativos reales de Keycloak y auditoría propietaria) y 7.2 (aceptación A1–A12 completa con toda la integración). No se afirma completitud usando dobles para esas garantías. El permiso `audit:read` sigue denegado y no se habilitó una política de borrado.

Las verificaciones adicionales de cierre de dominio fueron: backend unitario 50 archivos/467 pruebas; frontend unitario 36 archivos/221 pruebas; lint 0 errores (9 advertencias backend, 13 frontend); controles de arquitectura aprobados en ambas aplicaciones; builds Next.js/Vite aprobados. La nueva prueba de aislamiento de factura está en `backend/tests/integration/invoice-repository.test.ts`; los escenarios de selector están en `frontend/tests/e2e/organization-context.spec.ts`.

El progreso actual es **29/32 tareas**. No archivar hasta resolver 3.5, 6.6 y 7.2.
