# Tasks

## 1. Dominio, persistencia y migración de Driver

- [x] 1.1 Crear el módulo backend `fleet` con agregado Driver, estado, identidad/membership de referencia, invariantes y puertos de lectura/escritura; verificar con pruebas unitarias creación, unicidad por membership, elegibilidad y transiciones sin campos de perfil editables.
- [x] 1.2 Implementar el repositorio MongoDB de Driver, índices únicos, historial duradero local y transacciones que revaliden política, tercero, membership y versión; verificar integración contra una base terminada en `_test`, incluidos conflicto, revocación, cambio sin efecto y ausencia de entrega Audit transversal.
- [x] 1.3 Implementar inventario y migración idempotente de memberships DRIVER activas hacia Drivers, vinculando solo por `membershipId`; verificar repetición, tercero inactivo, conflicto y ausencia de fusiones por nombre/correo/documento.

## 2. Incorporación y consistencia con Organizations

- [x] 2.1 Definir el puerto de aprovisionamiento entre Organizations y Fleet, y componerlo sin que Domain/Application de Organizations importe infraestructura de Fleet; verificar la comprobación arquitectónica y dobles de puerto.
- [x] 2.2 Extender la aceptación de invitaciones DRIVER para confirmar invitación, membership, conductor e historial en una sola transacción; verificar éxito, fallo de aprovisionamiento, cancelación concurrente y doble aceptación sin cambios parciales.
- [x] 2.3 Extender el cambio de roles de membership para crear Driver ausente al agregar DRIVER e inactivarlo al retirarlo, conservando estado previo cuando ya existe; verificar roles repetidos, último rol, suspensión/revocación y auditoría sin cambiar Keycloak.
- [x] 2.4 Publicar el lector de hechos de Driver para propietarios de Flota y probar que conductor, membership o tercero inactivos producen no elegibilidad sin crear asignaciones, vehículos ni facturas.

## 3. API REST, autorización y documentación

- [x] 3.1 Implementar casos de uso de listado, detalle y transición de estado, separados de HTTP; verificar THIRD_PARTY_ADMIN limitado a su tercero, DRIVER limitado a sí mismo y ausencia de acceso global/por empresa.
- [x] 3.2 Implementar validadores Zod y Route Handlers delgados para `GET /api/drivers`, `GET /api/drivers/:id` y `PATCH /api/drivers/:id/status`; verificar cuerpos/parámetros cerrados, contexto de tercero explícito, 403 antes de buscar y 404 neutro para ID ajeno o inexistente.
- [x] 3.3 Conectar autenticación, autorización y la proyección Identity nullable en los endpoints; verificar 400, 401, 403, 404, 409, 503 y 500, perfil no disponible y que nombre/documento/correo no son mutables por la API.
- [x] 3.4 Publicar esquemas, seguridad Bearer, paginación, estados y errores en OpenAPI 3.1; verificar que Swagger, `openapi:lint` y pruebas HTTP de servidor standalone coinciden con el contrato.
- [x] 3.5 Actualizar `docs/authorization.md` y la documentación de Flota con el límite identidad-conductor, el alta mediante invitación, la migración y la ausencia temporal de actualización operativa; verificar enlaces y comandos documentados.

## 4. Interfaz de Conductores

- [x] 4.1 Ajustar los contratos de `frontend/src/modules/fleet` para Drivers y retirar `updateDriver`/campos personales editables sin romper la integración de Vehículos; verificar typecheck y pruebas unitarias de los DTOs/puertos.
- [x] 4.2 Implementar el adaptador HTTP protegido con destinos cerrados para Drivers, contexto capturado, cancelación y mapeo de 401/403/404/409/503; verificarlo con dobles HTTP y que un 403 invalida el snapshot de autorización conforme al ciclo existente.
- [x] 4.3 Reemplazar el marcador `/drivers` por listado, detalle de identidad solo lectura y confirmación de activar/desactivar; verificar permisos, acceso directo, cambio de contexto, foco/teclado y estados carga/vacío/error/conflicto/éxito a 360 px y 1280 px.
- [x] 4.4 Integrar el alta de conductor con el flujo de invitación DRIVER, sin formulario paralelo de identidad; verificar en navegador que la aceptación crea el registro visible y que la UI no expone edición de perfil Keycloak.

## 5. Verificación integrada

- [x] 5.1 Ejecutar `npm --prefix backend run check`, `npm --prefix backend run test:integration`, `npm --prefix backend run test:http` y `npm --prefix backend run openapi:lint`; verificar evidencia de autorización, concurrencia, migración y contrato REST.
- [x] 5.2 Ejecutar `npm --prefix frontend run check` y `npm --prefix frontend run test:e2e`; verificar el recorrido THIRD_PARTY_ADMIN/DRIVER, neutralidad de rutas y diseño responsive sin desbordamiento horizontal.
- [x] 5.3 Registrar resultados, límites de campos operativos pendientes, migración y dependencias con cambios activos en `docs/verification.md`; verificar que no se afirma implementación de vehículos, asignaciones, facturas ni cambios de Keycloak.

## Workflow follow-up

- Implementar desde la rama `openspec/implement-driver-management` creada desde `development` y abrir un pull request hacia `development` después de revisión aprobada.
- Archivar el cambio únicamente después de completar las tareas, sincronizar las especificaciones y satisfacer la revisión del proyecto.
