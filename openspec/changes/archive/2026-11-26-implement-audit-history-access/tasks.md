# Tasks

## 1. Permiso y contrato de consulta

- [x] 1.1 Actualizar la matriz y la política inicial para conceder `audit:read` solo a APP_ADMIN global; verificar que COMPANY_ADMIN, THIRD_PARTY_ADMIN y DRIVER reciban denegación en pruebas de autorización.
- [x] 1.2 Definir DTO allowlist, filtros, cursor compuesto, orden estable y límites de página; verificar OpenAPI 3.1 con ejemplos seguros y respuestas 400/401/403/404/503.
- [x] 1.3 Implementar consultas de listado y detalle mediante contrato de aplicación y repositorio de Audit; verificar paginación estable aun cuando se inserte un evento de lectura entre páginas.
- [x] 1.4 Probar aislamiento: permiso/contexto se validan antes de consultar documentos; verificar respuestas neutras y ausencia de filtros inválidos, payloads y campos sensibles en la respuesta.

## 2. Registro de lecturas

- [x] 2.1 Añadir el mapper allowlist para `AUDIT_HISTORY_READ` con source y actor verificado; verificar que no copie filtros, query string, valores de eventos ni datos personales.
- [x] 2.2 Persistir la evidencia durable de cada consulta antes de devolver resultados; verificar con pruebas que un fallo de auditoría produce 503 sin filtrar filas del journal.
- [x] 2.3 Documentar la semántica de autorregistro y sus métricas; verificar que una consulta no devuelve su propio evento, que consultas posteriores pueden verlo y que cursor/orden no duplican ni omiten eventos.

## 3. Interfaz de Auditoría

- [x] 3.1 Conectar `/audit` al listado con filtros controlados, cursor, carga, vacío, error y reintento; verificar navegación de varias páginas con eventos nuevos concurrentes.
- [x] 3.2 Implementar detalle de solo lectura y campos seguros; verificar que el frontend no muestra payloads, valores de factura, tokens, representaciones ni acciones de modificación/exportación.
- [x] 3.3 Ocultar navegación y rutas a usuarios sin grant, limpiar resultados al revocarse autorización y preservar respuesta segura en acceso directo; verificar APP_ADMIN global y roles denegados en navegador.
- [x] 3.4 Verificar teclado, foco y presentación a 360/1280 px; documentar estados y evidencia de accesibilidad.
- [x] 3.5 Mostrar fechas del historial y detalle en hora Colombia (COT), manteniendo filtros y contrato API en UTC; verificar conversión exacta en pruebas unitarias y E2E.
- [x] 3.6 Admitir y rotular la acción heredada `COMPANY_ADMIN_ASSOCIATED` para que eventos anteriores pendientes no bloqueen la publicación de ediciones de empresas.

## 4. Aceptación integrada

- [x] 4.1 Ejecutar pruebas backend, frontend y OpenAPI contra datos de prueba aislados; verificar grant APP_ADMIN global, registro de lectura, privacidad, cursor y retención vigente sin migrar datos.
- [x] 4.2 Confirmar que `implement-audit-logging` está integrado o que la UI informa claramente el estado de historial disponible sin afirmar cobertura completa; verificar cada fuente y acción central.
- [x] 4.3 Ejecutar `openspec validate implement-audit-history-access --strict` y los checks/builds afectados; registrar comandos y límites en `docs/verification.md`.

## 5. Mejoras de consulta y legibilidad

- [x] 5.1 Aplicar a las acciones de detalle de tabla el patrón visual compartido de `DataTableAction`, con etiqueta accesible; verificar escritorio y móvil.
- [x] 5.2 Resolver nombres administrativos actuales de empresa y tercero en el detalle, conservando IDs y degradando a ID cuando la entidad no esté disponible.
- [x] 5.3 Incorporar filtro de actor por nombre o ID al contrato, cliente HTTP protegido, backend, paginación por cursor y formulario; verificar que el UUID genere una petición y no se persista el término de búsqueda en eventos de acceso.

## Workflow follow-up

- Implementar después de completar la captura transversal de eventos de `implement-audit-logging` y aprobar la política APP_ADMIN global.
- Archivar solo tras aprobar los cambios de grants, revisar las pruebas de privacidad y confirmar el contrato de consulta.
