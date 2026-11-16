# Tasks

Implementación autorizada por el usuario mediante `$openspec-apply-change implement-organization-context`. Referencias: [diseño](design.md) y [capacidad organization-context](specs/organization-context/spec.md). Las pruebas de cada grupo acompañan su implementación; los últimos grupos verifican integración transversal. No instalar dependencias por inferencia ni modificar tareas de otros cambios.

## 1. Contratos y dominio

- [x] 1.1 Definir tipos puros de organización, asociación y contexto discriminado conforme a diseño §1–2, reutilizando OrganizationScope y roles existentes; verificar unitarias de COMPANY, THIRD_PARTY, GLOBAL, múltiples roles y combinaciones inválidas sin frameworks.
- [x] 1.2 Definir puertos de lectura de hechos, listado, resolución de permisos y eventos mínimos conforme a §3/9; verificar suite de contrato y grafo sin ciclo Organizations→Identity→Organizations, documentando propiedad en docs/architecture.md.
- [x] 1.3 Definir mapeo público de contexto a scopes existentes y revisiones opacas; verificar empresa sola, tercero solo y pares válidos/inválidos sin modificar la política de autorización.

## 2. Casos de uso — requiere 1

- [x] 2.1 Implementar descubrimiento con filtros de subject, actividad y grants completos, deduplicación y GLOBAL separado; verificar unitarias de cero/uno/varios destinos, roles mixtos, tipos mixtos y ausencia de tránsito empresa-tercero.
- [x] 2.2 Implementar resolución/validación por petición mediante puertos, con 403 neutro y fallos de dependencia distintos de vacío; verificar ID ajeno/inexistente, asociación revocada, organización inactiva y permisos vacíos con dobles compatibles.
- [x] 2.3 Documentar casos Select/Switch/Restore/Clear como composición del flujo sin sesión backend; verificar que no se introduce repositorio de contexto activo, login adicional ni permisos nuevos.

## 3. Persistencia Organizations — requiere 1–2

- [x] 3.1 Crear modelos Mongoose mínimos e índices de organizaciones, asociaciones y relaciones según §2; verificar integración real en base `_test` con unicidad, tipos incompatibles y múltiples capacidades sin credenciales ni roles globales persistidos.
- [x] 3.2 Implementar repositorios y lectura coherente de evidencia con revisiones/reintento acotado; ejecutar la suite de contrato sobre MongoDB real para sujeto, estados, pares, revocación y lectura que no converge.
- [x] 3.3 Crear fixtures aislados de pruebas y guía de datos requeridos/provisión autorizada; verificar que las lecturas no crean asociaciones, no sobrescriben política y devuelven vacío ante ausencia real de datos.

## 4. Integración con autorización — requiere 3

- [x] 4.1 Conectar el puente OrganizationAccessReader en bootstrap sustituyendo únicamente el proveedor indisponible; verificar GET /api/auth/permissions sobre asociaciones reales y regresión global/self, sin imports de modelos entre módulos.
- [x] 4.2 Conectar resolución de grants existente a listado y resolución sin duplicar matriz; verificar COMPANY_ADMIN en A/DRIVER en B, APP_ADMIN sin rol operativo y pares empresa-tercero incompatibles.
- [x] 4.3 Documentar invalidación, ausencia de caché positiva, ventana de roles JWT y contrato de confirmación futura; verificar lecturas consecutivas con cambios de política/asociación y mantener mutaciones sin proveedor fuera de alcance.

## 5. Captura mínima de auditoría — requiere 2–4

- [x] 5.1 Implementar puerto y almacenamiento durable mínimo de eventos de contexto con identificador estable para entrega; verificar selección/restauración/intención de cambio y fallo de captura que impide éxito, sin fingir soporte en SecurityEvent actual.
- [x] 5.2 Implementar denegaciones/invalidaciones sanitizadas y límites de volumen; verificar que no se registran tokens, payloads ni IDs ajenos y que fallo de auditoría conserva rechazo. Documentar diferencia entre invalidación observada y revocación del escritor.
- [x] 5.3 Documentar formato y contrato de entrega idempotente al futuro Audit; verificar contrato con doble y declarar explícitamente que no completa entrega/retención integral ni auditoría de cambios reales de asociaciones.

## 6. Endpoints REST — requiere 4–5

- [x] 6.1 Crear GET /api/organization-contexts con authenticatedEndpoint y DTO cerrado; verificar pruebas API de conjunto autorizado completo, vacío 200, query inválida 400, 401 y proveedor caído 503 sin exponer nombres ajenos.
- [x] 6.2 Crear POST /api/organization-contexts/resolve con Zod y unión GLOBAL/ORGANIZATION; verificar 200/400/401/403/503/500, campos adicionales, IDs manipulados y razones INITIAL/SWITCH/RESTORE sin usarlas como autorización.
- [x] 6.3 Reutilizar traducción central y no-store, manteniendo /me y rutas técnicas; verificar inventario HTTP sin GET/PUT/DELETE active ni endpoints de autenticación duplicados y documentar adaptación REST.

## 7. Swagger — requiere 6

- [x] 7.1 Extender backend/openapi/openapi.json con tag Organization Context, bearerAuth, esquemas cerrados, ejemplos, errores y reutilización de PermissionsSnapshot; verificar npm --prefix backend run openapi:lint y concordancia de respuestas HTTP.
- [x] 7.2 Documentar selección sin estado servidor, 403 neutro y 404 de recursos donde corresponda; verificar Swagger Try it out para listado/resolución sin persistir tokens y regresión de assets locales.

## 8. Estado y adaptadores frontend — requiere 6

- [x] 8.1 Crear módulo organization-context por capas y puerto/adaptador HTTP sobre protected-http; verificar parseo de ambos contextos, errores, timeout y cancelación con pruebas unitarias sin SDK en capas internas.
- [x] 8.2 Implementar preferencia mínima sessionStorage por sujeto/pestaña; verificar recarga, identidad distinta, valor manipulado, almacenamiento bloqueado y ausencia de tokens/nombres/permisos persistidos.
- [x] 8.3 Implementar store y coordinación con authorization.setContext sin duplicar autoridad de permisos; verificar estados, generación, rechazo/caducidad de permisos y descarte de resolución tardía.
- [x] 8.4 Conectar inicio tras identidad confirmada: restauración, GLOBAL, uno automático, varios manual y vacío; verificar casos 1–8/14 con Testing Library y documentar destino provisional /session.

## 9. Selección e indicador — requiere 8

- [x] 9.1 Construir OrganizationSelectionPage y tarjetas MUI con marca, usuario, nombre/tipo/roles y acciones; verificar carga, error/reintento, vacío y logout, sin selección arbitraria.
- [x] 9.2 Incorporar OrganizationSelector y ActiveOrganizationIndicator en cabecera; verificar consulta fresca, GLOBAL distinguible y cambios empresa/tercero sin llamada de login.
- [x] 9.3 Verificar accesibilidad y diseño en 360/1280 px con teclado/lector de pantalla, foco, anuncios y controles de 44 px; registrar evidencia visual y ausencia de scroll horizontal.

## 10. Guards y navegación — requiere 9

- [x] 10.1 Componer OrganizationContextGuard con PrivateRoute y guards de permisos existentes; verificar deep link sin contexto, GLOBAL sin organización, 401 frente a 403 y ausencia de bucles/destinos externos.
- [x] 10.2 Actualizar navegación y resumen /session por contexto y permisos; verificar que solo se presentan módulos implementados y que estados de carga/invalidación ocultan contenido privado.

## 11. Transición, limpieza y ciclo de sesión — requiere 8–10

- [x] 11.1 Implementar confirmación de datos sin guardar y callbacks de limpieza de formularios/cachés/selecciones, con desmontaje por generación; verificar cancelar conserva A y confirmar limpia A antes de resolver B.
- [x] 11.2 Capturar scope inmutable y coordinar cancelación/generación con el transporte y store existentes; verificar respuestas tardías, A→B→C, fallo de B y escritura ya recibida que no se reproduce en B.
- [x] 11.3 Conectar Clear, logout, 401, foco y renovación de sesión con limpieza/revalidación; verificar asociación revocada y política cambiada sin snapshots caducados habilitando acciones.
- [x] 11.4 Añadir aviso entre pestañas exclusivamente para limpieza de sesión sin transmitir credenciales; verificar selección independiente, logout en ambas y pestaña duplicada con preferencia revalidada.
- [x] 11.5 Documentar ciclo de contexto y puntos de integración para módulos futuros; verificar ejemplos de limpieza y captura de scope con componentes de prueba sin construir CRUD.

## 12. Integración y aceptación del incremento — requiere 1–11

- [x] 12.1 Ejecutar check y build independientes de frontend/backend, lint OpenAPI y controles de arquitectura; registrar resultados y confirmar que capas internas no importan React/Next/Keycloak/Mongoose.
- [x] 12.2 Ejecutar MongoDB y HTTP reales con datos aislados para listado/resolución, lectura de permisos, revocación, manipulación y auditoría mínima; contrastar escenarios de la spec y preservar /me/health/docs/openapi.
- [x] 12.3 Ejecutar Playwright con Keycloak/API/MongoDB para los flujos de login, uno/varios/cero, GLOBAL, cambio, recarga, expiración, logout y dos pestañas; verificar cero filtraciones de contexto anterior y no nuevo login al cambiar.
- [x] 12.4 Publicar matriz de evidencia de los 22 casos, distinguiendo implementación real, pruebas de contrato y dependencias externas; verificar que entrega del lector/selector aporta evidencia para autorización 6.1–6.2 sin marcar sus tareas automáticamente.
- [x] 12.5 Revisar documentación y alcance final, ejecutar openspec validate implement-organization-context --strict --no-interactive y registrar ausencia de CRUD, permisos nuevos, dependencias instaladas sin necesidad o modificaciones de Keycloak ajenas al cambio.

## 13. Aceptación cruzada dependiente — solo con proveedores reales

- [ ] 13.1 Verificar caso 19 y restricciones DRIVER sobre lecturas/listados/conteos/escrituras de recursos reales con sus filtros de pertenencia; dependencia: Fleet/Invoices/Organizations entregados por sus cambios. No completar con dobles ni implementar su CRUD aquí.
- [ ] 13.2 Verificar revocación concurrente en el punto de confirmación real de una mutación conforme a AuthorizedMutation; dependencia: unidad de confirmación y escritor versionado de los propietarios. No habilitar mutaciones sin demostrar rechazo de revisión obsoleta.

Las tareas 13.1–13.2 permanecen pendientes si faltan proveedores; no impiden revisar la propuesta ni desarrollar el incremento de selección, pero impiden afirmar aceptación operativa integral. Entrega a Audit, retención y auditoría de revocaciones del escritor permanecen en cambios propietarios, no se simulan como funcionalidad terminada aquí.

## Workflow follow-up

- La aprobación de implementación ya fue recibida; no autoriza despliegue, sincronización ni archivo.
- Sincronizar/archivar únicamente mediante el flujo autorizado posterior; reconciliar autenticación, autorización y la referencia a selección de initial-invoices-app, conservando propiedad de Organizations.
- No archivar este cambio con tareas dependientes pendientes ni marcar tareas de otros cambios por equivalencia.
