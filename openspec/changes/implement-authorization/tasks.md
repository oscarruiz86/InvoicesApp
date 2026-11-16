# Tasks

Implementación autorizada por el usuario mediante `$openspec-apply-change implement-authorization` el 2026-11-09; alcance y evidencia en `docs/authorization-progress.md`. Las casillas se completan solo después de verificar cada tarea. Referencias: [diseño](design.md), [identity-access](specs/identity-access/spec.md) y [frontend-shell](specs/frontend-shell/spec.md).

El núcleo puede desarrollarse con puertos y dobles. Las tareas de integración identificadas como dependientes no se completan con simulaciones ni autorizan implementar CRUD o el selector de otro cambio. Si falta su proveedor, conservar la tarea pendiente y el comportamiento 503/denegado documentado. Las decisiones de producto pendientes conservan denegación; no hace falta inventar permisos para avanzar con el núcleo.

## 1. Alcance aprobado y contratos de integración

- [x] 1.1 Registrar la nueva autorización de implementación y el alcance de la matriz, comprobando que permisos pendientes siguen denegados y que no se incluyen CRUD, selector, despliegue ni sincronización automática de otros cambios; entregar registro de alcance y correspondencia A1–A12.
- [x] 1.2 Definir contratos públicos de hechos organizacionales, capacidades locales y revisiones conforme a diseño §4; documentar el acuerdo de consumo con Organizations y verificar con fixtures empresa sola, tercero solo, pareja válida/inválida y asociación inactiva, sin crear persistencia de asociaciones.
- [x] 1.3 Definir contratos de pertenencia, elegibilidad, confirmación concurrente y eventos auditables conforme a diseño §4/8; verificar suites de contrato con dobles y documentar qué debe aportar Fleet/Invoices/Configuration/Audit antes de conectar cada integración.

## 2. Políticas puras y matriz — requiere 1

- [x] 2.1 Añadir catálogo exacto de permisos, grants y alcances al dominio identity reutilizando ApplicationRole; verificar identificadores únicos y rechazo de permisos/roles desconocidos mediante pruebas unitarias, documentando el catálogo.
- [x] 2.2 Implementar la matriz inicial y techo permitido; verificar cada celda, permisos pendientes, ausencia de herencia y APP_ADMIN sin privilegios operativos mediante pruebas parametrizadas y publicar la tabla de referencia junto a la guía de autorización.
- [x] 2.3 Implementar decisión deny-by-default sobre grants completos; verificar múltiples roles, COMPANY_ADMIN en A/DRIVER en B, asociación inactiva y ausencia de acceso transitivo con pruebas sin frameworks.
- [x] 2.4 Implementar restricciones de delegación y alcance propio; verificar roles/subject falsificados, autoescalamiento, asociación ajena y destinos COMPANY_ADMIN/THIRD_PARTY_ADMIN permitidos, sin crear identidades ni asociaciones reales.
- [x] 2.5 Implementar coordinación de requisitos de DRIVER usando hechos externos; verificar vehículo desactivado, asignación inactiva/ajena, factura ajena, QR y MANUAL dentro/fuera de elegibilidad con cero llamadas de escritura al rechazar; documentar qué cálculos siguen siendo del módulo propietario.

## 3. Aplicación, persistencia de política y auditoría — requiere 2

- [x] 3.1 Implementar GetUserPermissions, GetEffectivePermissions, CheckPermission y AuthorizeResourceAccess con puertos pequeños; verificar actor sin roles, alcance inválido y proveedor indisponible con dobles, preservando requireRoles y actor.permissions sin autoridad organizacional.
- [x] 3.2 Implementar repositorio de política versionada e inicialización idempotente de la matriz; verificar sobre base MongoDB aislada terminada en `_test` que no sobrescribe revisiones ni contiene credenciales/roles de usuarios y que ausencia/fallo no produce fallback permisivo; documentar inicialización y recuperación.
- [x] 3.3 Implementar UpdateRolePermissions limitado al techo con comparación de versión y captura atómica duradera de auditoría; verificar éxito, conflicto, permisos pendientes, ampliación de ámbito y fallo de captura sin mutación confirmada; no exponer endpoint de escritura.
- [x] 3.4 Implementar emisión de eventos de denegación sanitizados, control de volumen y contadores; verificar ausencia de tokens/claims/payloads sensibles y que fallo de registro mantiene el rechazo; documentar campos y tratamiento de supresiones.
- [ ] 3.5 Conectar entrega idempotente de eventos capturados al contrato Audit cuando su adaptador exista; verificar recuperación tras interrupción y reentrega sin duplicar hechos, y documentar operación/retención acordada con su propietario. Dependencia: Audit real; una prueba con doble no completa esta tarea.

## 4. Protección HTTP y contrato REST — requiere 3.1–3.4

- [x] 4.1 Componer wrappers de permiso, contexto y recurso después de authenticatedEndpoint, conservando validación JWT existente; verificar handlers de prueba ante token ausente/inválido/expirado, permiso faltante y caso permitido, sin publicar endpoints de negocio.
- [x] 4.2 Extender traducción central para INVALID_REQUEST, RESOURCE_NOT_FOUND y AUTHORIZATION_UNAVAILABLE; verificar orden configuración/autenticación/autorización, respuestas neutras 401/403/404/503, no-store y ausencia de efectos de negocio.
- [x] 4.3 Implementar GET /api/auth/permissions y su validación Zod con scope/IDs estrictos; verificar DTO cerrado, sujeto propio, sin roles, parámetros repetidos/desconocidos, global no permitido, contexto inválido y proveedor organizacional ausente; conservar /me y técnicos públicos.
- [x] 4.4 Extender backend/openapi/openapi.json con endpoint, esquemas, ejemplos, errores, headers y metadata de permiso/alcance; verificar `npm --prefix backend run openapi:lint` y concordancia HTTP/DTO e inventario de rutas privadas, documentando consulta por Swagger sin persistir tokens.
- [x] 4.5 Verificar renovación de roles con token anterior/nuevo y reloj controlado, y cambio de política entre solicitudes sin caché positiva; reutilizar suites JWT y documentar ventana de hasta 330 segundos bajo vida de token configurada de 300 segundos.

## 5. Frontend y sesión — requiere 4

- [x] 5.1 Añadir puerto/caso de uso de consulta de permisos y adaptador HTTP sobre transporte protegido existente; verificar parseo estricto, cancelación y categorías 401/403/404/503 sin exponer tokens, documentando el DTO público.
- [x] 5.2 Añadir estado de autorización no persistido con generación de sesión/contexto; verificar carga, éxito, error, logout, cambio A→B y respuesta tardía con pruebas unitarias y documentar su ciclo de vida.
- [x] 5.3 Integrar notificación sin credenciales de renovación con invalidación de permisos y actualización por foco/temporizador de 30 segundos; verificar con reloj controlado que snapshots vencidos no habilitan acciones y que 403 no inicia bucles de consulta/login.
- [x] 5.4 Añadir ProtectedRoute componiendo PrivateRoute, PermissionGuard, hooks y acceso denegado; verificar carga sin filtración, 401 frente a 403 y elegibilidad de acciones con Testing Library, sin nuevas pantallas CRUD.
- [x] 5.5 Integrar navegación autorizada solo de módulos implementados y contrato de cambio de contexto; verificar DRIVER sin administración y THIRD_PARTY_ADMIN con su alcance mediante rutas/componentes de prueba, y documentar uso futuro por módulos y selector sin implementarlos.

## 6. Integraciones reales dependientes — requiere 4–5 y proveedores indicados

- [ ] 6.1 Conectar el contrato real de Organizations mediante su API interna pública, sin importar modelos ajenos; verificar sobre persistencia real asociaciones/capacidades activas e inactivas, empresa/tercero incompatibles y múltiples organizaciones. Dependencia: entrega de asociaciones y contexto en su cambio propietario; documentar evidencia y versión del contrato.
- [ ] 6.2 Conectar el selector organizacional real al consumidor frontend de cambio de contexto; verificar con Playwright A→B, respuesta tardía, datos privados vaciados y contexto rechazado. Dependencia: implement-organization-context; no sustituirlo por selector temporal.
- [ ] 6.3 Verificar contratos reales de pertenencia y filtros de alcance de módulos ya entregados usando lectura/listado/conteo y mutación por IDs ajenos; demostrar ausencia de acceso horizontal y datos de negocio inalterados. Dependencia: recursos reales de Organizations/Fleet/Invoices, sin implementar su CRUD en esta tarea.
- [ ] 6.4 Verificar confirmación concurrente con revocación de asociación/política o cambio de recurso entre evaluación y escritura; documentar garantía de serialización/revisión del propietario y demostrar que una decisión obsoleta no confirma. Dependencia: persistencia y unidad de confirmación de los módulos propietarios.
- [ ] 6.5 Verificar evidencia real de vehículo/asignación activos y elegibilidad de factura manual/QR; probar los rechazos solicitados sin duplicar el cálculo de ventana ni captura QR. Dependencia: Fleet, Invoices y Configuration; registrar por separado evidencia de autorización y pruebas de negocio de esos cambios.
- [ ] 6.6 Verificar eventos administrativos reales de Keycloak y cambios de asociaciones del propietario a través del contrato de auditoría; comprobar actor, sanitización, correlación, entrega y recuperación antes de declarar cobertura integral. Dependencia: recolección de eventos/Audit e integración administrativa entregadas por sus cambios; no activar configuración del proveedor por inferencia de esta tarea.

## 7. Aceptación integrada — requiere grupos anteriores

- [x] 7.1 Extender y ejecutar los controles de arquitectura de ambas aplicaciones con casos negativos para frameworks en Domain/Application, imports entre aplicaciones y modelos ajenos; verificar `npm --prefix backend run check` y `npm --prefix frontend run check` sin servicios externos.
- [ ] 7.2 Ejecutar builds independientes, OpenAPI, HTTP real, integración MongoDB aislada y navegador con dependencias disponibles; verificar A1–A12 y regresión de health/docs/openapi y /auth/me, registrando fallos/bloqueos sin marcar como implementados los escenarios cubiertos solo por dobles.
- [x] 7.3 Reconciliar guía de autorización, matriz, dependencias y evidencia con los artefactos; verificar ausencia de CRUD/selector duplicados, secretos y configuración ajena modificada, y ejecutar `openspec validate implement-authorization --strict --no-interactive` antes de presentar el resultado para revisión.

## Workflow follow-up

- La sincronización/archivo de implement-authentication corresponde a su propio flujo autorizado; realizarla antes de sincronizar esta delta de identity-access. No archivar automáticamente initial-invoices-app ni marcar sus tareas por equivalencia.
- Mantener este cambio sin archivar mientras existan tareas dependientes pendientes; una entrega parcial del núcleo no equivale a aceptación completa.
- Tras completar implementación, integraciones y revisión, solicitar el flujo de archivo si el usuario lo desea. La creación de esta propuesta no inicia ninguno de esos pasos.
