# Tasks

## 1. Dominio y persistencia

- [x] 1.1 Incorporar Vehicle y value objects de los tres campos dentro de Fleet; verificar pruebas unitarias de normalización, ceros iniciales, límites, propietario inmutable y cambios sin efecto.
- [x] 1.2 Crear puertos de repositorio y hechos de Vehicle sin tipos de framework; verificar comprobación arquitectónica y pruebas del contrato de elegibilidad de estado.
- [x] 1.3 Implementar MongoDB con índices únicos de placa/tarjeta globales y número interno por tercero; verificar en MongoDB real duplicados concurrentes, registros inactivos y edición del propio registro.
- [x] 1.4 Implementar mutaciones con coordinación de política, membership, asociación y tercero, versión e historial atómicos; verificar revocaciones, conflictos y fallo de captura sin cambios parciales en una base _test.
- [x] 1.5 Crear inventario técnico previo a índices y documentar reconciliación sin valores inventados; verificar datos vacíos, válidos, incompletos y duplicados sin modificar datos funcionales durante el inventario.

## 2. Integraciones de Fleet

- [x] 2.1 Definir AssignmentAccessReader y contrato de confirmación para desactivación, diferenciando ausencia, asignación y proveedor no disponible; verificar con dobles y documentar que no acredita integración real ni doble asignación.
- [x] 2.2 Componer el proveedor MongoDB de `vehicle_assignments`; verificar 503 ante indisponibilidad o documentos inválidos, 409 ante asignación activa, desactivación exitosa sin asignaciones y disponibilidad independiente de alta/consulta/edición administrativas.
- [x] 2.3 Integrar DriverFactsReader y filtros de asignación propia antes de paginar/contar mediante puertos; verificar conductor inactivo, tercero ajeno, asignación ajena e identidad con varios roles sin depender de roles locales del JWT.
- [x] 2.4 Documentar contratos futuros de Assignments/Invoices y conservación histórica; verificar que no se publican rutas de transferencia ni operaciones de asignación y que ningún cambio reescribe facturas.

## 3. REST y seguridad

- [x] 3.1 Implementar casos de uso de lista/detalle/alta/edición/estado con permisos explícitos y recurso aislado; verificar 403 antes de consultar existencia y 404 idéntico para inexistente/ajeno.
- [x] 3.2 Añadir presentación Zod, bootstrap y Route Handlers GET/POST /api/vehicles, GET/PATCH /api/vehicles/:id y PATCH /api/vehicles/:id/status; verificar cuerpos cerrados, tres campos requeridos, scope, IDs, duplicados, paginación y orden mediante pruebas HTTP.
- [x] 3.3 Publicar OpenAPI 3.1, Bearer, Location, no-store y errores reales; verificar openapi:lint y pruebas contra servidor standalone, incluidos conflictos únicos y 503 del proveedor ausente.
- [x] 3.4 Documentar formatos propuestos, unicidad, permisos y limitaciones operativas en docs/vehicle-management.md y docs/authorization.md; verificar coherencia con los contratos y ausencia de nuevas dependencias/grants.

## 4. Frontend

- [x] 4.1 Extender VehicleApi/VehicleDto con número interno, tarjeta, alta, detalle y disponibilidad de asignación; verificar contratos cerrados y compatibilidad con DriverApi mediante pruebas y typecheck.
- [x] 4.2 Crear adaptador HTTP con rutas cerradas y tratamiento central de 401/403/404/409/503; verificar cancelación, timeout, respuestas malformadas e invalidación de autorización ante 403.
- [x] 4.3 Conectar Vehículos con listado paginado/ordenable, búsqueda, filtros y los tres campos visibles; verificar filtros de contexto y representación distinta de asignación desconocida y sin conductor.
- [x] 4.4 Añadir alta, detalle, edición de los tres campos y confirmación de estado según permisos; verificar validación, duplicados, versión obsoleta, conservación de formulario seguro y 503 comprensible sin éxito ficticio.
- [x] 4.5 Verificar cambio de contexto durante lectura/escritura, limpieza de datos y descarte de respuestas anteriores; cubrir navegador a 360/1280 px con teclado, foco y sin desbordamiento, preservando recorridos de Conductores.

## 5. Verificación integrada

- [x] 5.1 Ejecutar npm --prefix backend run check, test:integration, test:http y openapi:lint según sus scripts; registrar resultados con MongoDB _test y servidor de prueba preparado.
- [x] 5.2 Ejecutar npm --prefix frontend run check, build y test:e2e; registrar evidencia del recorrido administrativo y rechazo DRIVER por dependencia ausente.
- [x] 5.3 Registrar evidencia y límites en docs/verification.md; distinguir escenarios probados con dobles de integración real pendiente de Assignments, Invoices y Audit.

## Workflow follow-up

- Implementar desde openspec/implement-vehicle-management creada desde development; abrir PR hacia development y respetar revisión aprobada.
- La gestión de asignaciones y sus escritores permanecen fuera de alcance; deberán persistir el contrato `vehicle_assignments` y coordinarse con esta confirmación antes de habilitar transferencias o doble asignación.
- Sincronizar, documentar y archivar después de completar el alcance aprobado y sus verificaciones.
