# Tasks

## 1. Reglas de política y continuidad administrativa

- [x] 1.1 Añadir validación pura de la política candidata que conserve únicamente roles, permisos, ámbitos y combinaciones de `grantCeiling`; verificar con pruebas unitarias grants válidos, duplicados y combinaciones fuera del techo.
- [x] 1.2 Exigir `APP_ADMIN / roles:read / global` y `APP_ADMIN / roles:manage / global` en toda política persistible y repetir la validación en Application e Infrastructure; verificar que retirar cualquiera de esos grants rechaza la escritura y conserva la versión anterior.
- [x] 1.3 Implementar casos de uso de lectura y reemplazo de política separados de HTTP, y verificar acceso exclusivo de APP_ADMIN GLOBAL con `roles:read`/`roles:manage` mediante pruebas de autorización.
- [x] 1.4 Verificar el control de concurrencia, la actualización atómica de versión/evento y el fallo cerrado de la cola de auditoría en MongoDB real; distinguir capacidad de auditoría agotada de un conflicto de versión y ejecutar escenarios simultáneos con una base terminada en `_test`.

## 2. REST, seguridad y documentación de contrato

- [x] 2.1 Implementar validadores Zod y controladores delgados para GET/PUT `/api/roles`, con `scope=global` explícito; verificar rechazo de scopes, IDs, parámetros duplicados, propiedades desconocidas y cuerpos incompletos.
- [x] 2.2 Componer los endpoints en bootstrap reutilizando autenticación, `AuthorizationPolicy` y el repositorio existente; mapear capacidad de auditoría agotada a `503 POLICY_AUDIT_CAPACITY` y verificar 401, 403, 400, 409, 503 y 500 con JSON/no-store y sin información sensible.
- [x] 2.3 Publicar los esquemas de política, catálogo, versiones y errores reales en OpenAPI 3.1; verificar que Swagger y respuestas HTTP de un servidor standalone coinciden con el contrato.
- [x] 2.4 Registrar auditoría `POLICY_CHANGED` con actor, correlación, versiones y ámbito global, sin JWT, claims completos, payload o secretos; verificar que un fallo de captura no confirma la política.
- [x] 2.5 Documentar en `docs/authorization.md` el catálogo cerrado, `grantCeiling`, continuidad de `roles:read` y `roles:manage`, recuperación operativa y limitación frente a APP_ADMIN ausentes en Keycloak; verificar los comandos documentados.

## 3. Integración de autorización e invalidación

- [x] 3.1 Confirmar que cada mutación propietaria reevalúa la versión de política al confirmar y añadir pruebas de que una operación pendiente no usa una política sustituida; verificar rechazo sin cambio parcial.
- [x] 3.2 Extender el transporte protegido con operaciones exclusivamente permitidas para `/roles`, preservando token en adaptador, timeout, cancelación y tratamiento de 401/403/409; propagar un 403 de roles al mecanismo central de permisos y verificarlo con dobles HTTP.
- [x] 3.3 Actualizar el store de autorización para invalidar y recargar el snapshot GLOBAL después de guardar una política; verificar que permisos retirados eliminan acciones y protegen rutas sin cerrar sesión.
- [x] 3.4 Reemplazar el marker `/roles` por una ruta global protegida y ajustar navegación para ocultarla fuera de GLOBAL o sin `roles:read`; verificar acceso directo, cambio de contexto y actualización de permisos.

## 4. Interfaz de Roles y permisos

- [x] 4.1 Crear `frontend/src/modules/role-management` con DTOs puros, puertos de aplicación, adaptador HTTP y pruebas de validación de contratos para lectura, actualización, error no JSON y respuesta malformada.
- [x] 4.2 Implementar matriz de roles, permisos y ámbitos usando exclusivamente el catálogo devuelto por servidor, con un solo rol visible a la vez; verificar que no permite editar nombres, inventar permisos, scopes ni roles personalizados.
- [x] 4.3 Implementar edición de matriz completa con confirmación, bloqueo durante envío y manejo de validación/conflicto/indisponibilidad; verificar que 409 y `503 POLICY_AUDIT_CAPACITY` conservan la matriz segura y permiten recarga antes de reintentar.
- [x] 4.4 Implementar estados de carga, vacío, error, éxito y acceso denegado sin revelar grants a usuarios no autorizados; verificar controles etiquetados, foco visible y uso con teclado a 360 px y 1280 px.
- [x] 4.5 Añadir pruebas de navegador para lectura global, guardado exitoso, continuidad de `roles:read` y `roles:manage`, conflicto concurrente, invalidación de navegación y ausencia de desbordamiento horizontal.

## 5. Verificación integrada

- [x] 5.1 Ejecutar typecheck, lint, pruebas unitarias y comprobación arquitectónica de frontend y backend; verificar que Domain/Application no importan frameworks ni adaptadores HTTP/MongoDB.
- [x] 5.2 Ejecutar integración MongoDB, pruebas HTTP/OpenAPI y navegador contra servicios preparados; verificar control de versión, auditoría, denegaciones, invalidación y continuidad administrativa.
- [x] 5.3 Registrar la evidencia, límites de auditoría pendiente y cualquier conflicto con cambios activos en `docs/verification.md`; verificar que no se afirman cambios de roles, perfiles o asociaciones en Keycloak.

## Workflow follow-up

- Implementar desde la rama `openspec/implement-role-management` creada desde `development` y abrir un pull request hacia `development` después de revisión aprobada.
- Archivar el cambio únicamente después de completar las tareas, sincronizar las especificaciones y satisfacer la revisión del proyecto.
