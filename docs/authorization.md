# Autorización

Identity & Access evalúa permisos en backend después de validar el JWT. La UI consume un snapshot informativo: no es credencial ni autorización sobre cualquier instancia. `actor.permissions` sigue vacío y no concede acceso. `APP_ADMIN` procede del rol global firmado en Keycloak; los roles organizacionales proceden de asignaciones locales ligadas a una Membership activa. MongoDB guarda esas pertenencias y la política, nunca passwords ni tokens.

## Matriz y catálogo

El catálogo exacto está en `backend/src/modules/identity/domain/permissions.ts`. Cada permiso es `resource:action`, sin comodines. Grants conservan juntos rol y ámbito; ningún rol hereda otro.

| Rol | Concesiones iniciales |
| --- | --- |
| APP_ADMIN, global | companies:create/read/update/deactivate; users:create/read/update/associate; parameters:read/update; roles:read/manage; associations:read/manage. |
| COMPANY_ADMIN, empresa asociada | companies:read/update; third-parties:create/read/update/deactivate; users:create/read/associate de administradores de tercero; associations:read/manage dentro de sus empresas. |
| THIRD_PARTY_ADMIN, tercero asociado | third-parties:read/update; drivers:create/read/update/deactivate; vehicles:create/read/update/deactivate/assign/unassign; assignments:read; invoices:read/update con elegibilidad del propietario. |
| DRIVER, propio | users:read y drivers:read. |
| DRIVER, tercero y recursos propios | vehicles:read activos asignados, assignments:read propias activas, invoices:create/read/update con reglas de propiedad, asignación, origen y plazo. |

Las barras abrevian permisos individuales. Todo lo no listado se deniega, incluidos invoices:delete, audit:read, parameters:create/deactivate y administración operativa global. Esos permisos reconocidos no se pueden habilitar editando la política: el techo permanece en código y requiere una nueva decisión de producto. users:update no asigna roles. Crear/asociar administradores exige controles separados: APP_ADMIN solo delega COMPANY_ADMIN y COMPANY_ADMIN solo THIRD_PARTY_ADMIN dentro de su ámbito; sin autoescalamiento.

## Contratos de los propietarios

OrganizationAccessReader recibe subject verificado y contexto explícito. Su respuesta incluye el mismo sujeto/contexto, revisión, estados de organizaciones, relación activa de la pareja y capacidades funcionales con Membership activa. Una capacidad de COMPANY_ADMIN en A no se combina con una asociación DRIVER en B. Un tercero solo exige Membership directa; empresa+tercero exige también relación activa, sin acceso transitivo. Ausencia/inactividad produce rechazo; error del proveedor produce indisponibilidad.

ResourceAccessReader debe aplicar alcance y propietario ANTES de listar, contar, paginar o leer por ID. Sus ResourceFacts son hechos confiables del servidor, nunca un cuerpo HTTP reutilizado. Null oculta IDs inexistentes/ajenos. La autorización compara tipo, ID, propietario y organizaciones; la escritura debe volver a comprobar evidencia en su punto de confirmación.

AuthorizationReceipt transporta revisiones de política/contexto/recurso; AuthorizedMutation es el compromiso del propietario de comprobarlas atómicamente al confirmar. No es un ticket reutilizable ni un mecanismo implementado de transacción de negocio. No habilitar escrituras funcionales sin la garantía real. Las pruebas de ese contrato usan dobles y no acreditan transacciones de Organizations/Invoices.

Fleet publica hechos de elegibilidad del conductor basados en su estado, membership DRIVER y tercero activos. Assignment conserva relaciones activas e históricas. THIRD_PARTY_ADMIN administra asignaciones mediante `vehicles:assign` y `vehicles:unassign`; `assignments:read` permite consultar su tercero activo, mientras DRIVER solo consulta sus propias asignaciones activas. Invoices debe consultar los propietarios antes de confirmar sus operaciones. Identity no calcula elegibilidad ni copia perfiles. Para DRIVER y THIRD_PARTY_ADMIN, las facturas QR siempre responden `QR_IMMUTABLE` después de autorizar ámbito y recurso, antes de consultar Configuration o modificar datos/imágenes. MANUAL vencida se rechaza. Otros roles requieren elegibilidad del módulo propietario, sin excepción privilegiada automática.

## Política persistida y auditoría

`authorization_policies` contiene un documento `active` con grants y versión. La inicialización explícita usa setOnInsert y nunca reemplaza revisiones. La lectura no crea datos ni tiene fallback permisivo. Cada decisión consulta política/asociación nuevamente; no hay caché positiva entre peticiones.

UpdateRolePermissions exige roles:manage, versión actual y grants dentro del techo. El repositorio confirma revisión y evento pendiente en una única actualización de documento MongoDB; conflicto o fallo impide éxito. Captura limitada a 1000 eventos pendientes: al llenarse, nuevas modificaciones fallan cerradas hasta que Audit proporcione entrega/retención. La inicialización técnica nunca reasigna grants ni roles a usuarios.

`GET /api/roles?scope=global` permite a APP_ADMIN consultar la matriz únicamente con `roles:read`; `PUT /api/roles?scope=global` reemplaza la matriz completa únicamente con `roles:manage` y una `expectedVersion` vigente. Ambas operaciones publican JSON con `Cache-Control: no-store`. Solo existen APP_ADMIN, COMPANY_ADMIN, THIRD_PARTY_ADMIN y DRIVER. El servidor publica roles, permisos y `grantCeiling`; el navegador no define combinaciones autorizadas. Cada política persistible conserva `APP_ADMIN / roles:read / global` y `APP_ADMIN / roles:manage / global`; una modificación que retire cualquiera se rechaza. Una versión vencida responde 409 `POLICY_CONFLICT`; la capacidad de eventos agotada responde 503 `POLICY_AUDIT_CAPACITY` sin mutar la matriz. El evento `POLICY_CHANGED` incluye actor verificado, correlación generada, versión anterior/nueva y ámbito global, y se confirma junto con los grants. No registra JWT, claims, carga útil o secretos.

La continuidad de grants protege la capacidad del rol APP_ADMIN, pero no consulta el directorio de Keycloak ni garantiza que exista una persona asignada a ese rol. Si no queda ningún APP_ADMIN en Keycloak, la recuperación requiere el procedimiento operativo de identidad del entorno, fuera de esta API. La matriz local nunca cambia roles, asignaciones, credenciales ni perfiles de Keycloak.

Eventos de denegación contienen solo eventId, instante, subject verificado, acción, resultado, motivo categórico, correlación generada y contador de supresiones. El límite es 100 eventos/minuto/proceso; no acumula claves de solicitudes controladas por clientes. El siguiente evento emitido informa supresiones; fallar el destino conserva rechazo. No registrar tokens, payloads, claims o IDs organizacionales no verificados. El destino de diagnóstico actual es el log estructurado del servidor; no sustituye Audit persistente. Cambios sensibles se capturan sin muestreo junto a la política. Recolección de eventos administrativos Keycloak y entrega a Audit siguen pendientes; un token nuevo no demuestra quién cambió un rol.

Cuando el contexto ya fue validado, la denegación incluye el permiso y una copia mínima de ese ámbito. Un contexto rechazado no expone sus IDs en el evento. Los cambios de política identifican el recurso conocido `authorization-policy/active` y su ámbito global; nunca se copian propiedades arbitrarias del objeto recibido.

## Consistencia de sesión

Los roles locales del JWT se ignoran: cada petición vuelve a leer las asignaciones de la Membership activa. Retirar un rol o suspender la Membership deniega la siguiente operación, incluso con un token anterior vigente. El snapshot incluye roles y permisos locales actuales y se renueva cada 30 segundos; el frontend lo invalida al cambiar contexto o sesión, recibir 403, volver a foco y vencer el snapshot. No se envían notificaciones de cambios de rol ni se fuerza el logout. Un 403 conserva la sesión. `APP_ADMIN` sigue la vigencia normal del JWT y su tolerancia de reloj.

## Consulta REST

`GET /api/auth/permissions` usa Bearer; scope es self (predeterminado), global u organization. companyId/thirdPartyId son IDs opacos de 1–128 caracteres, solo admitidos en organization y al menos uno requerido allí. Duplicados, parámetros desconocidos y combinaciones inválidas producen 400 INVALID_REQUEST. El sujeto siempre procede del JWT. Global requiere grant global; un usuario sin roles obtiene permisos propios vacíos.

Respuesta: subject, scope {kind, companyId, thirdPartyId}, roles y permissions únicos efectivos, policyVersion, contextRevision, evaluatedAt UTC y refreshAfterSeconds=30. IDs ausentes y revisión global son null; self conserva revisión cuando depende de Membership. Todos los objetos son cerrados; JSON/no-store en éxito y error. 401 conserva WWW-Authenticate; 403 oculta detalles del contexto; falta del proveedor/política produce 503 AUTHORIZATION_UNAVAILABLE. `/me` conserva independencia de MongoDB y sus roles de token no habilitan permisos locales. El contrato completo se publica en OpenAPI/Swagger existentes.

La protección por permiso se compone después de authenticatedEndpoint. El permiso se declara por el handler, nunca llega del cliente. Para acceso por ID, se rechaza por permiso antes de buscar existencia; inexistente/ajeno produce 404 neutro. Los módulos deben publicar solo sus rutas implementadas y mantener una política explícita por operación.

## Preparación de la política

Con MongoDB accesible y `backend/.env.local` configurado, ejecutar desde la raíz `npm --prefix backend run authorization:init`. Usa el cargador TypeScript Vite ya instalado, sin abrir servidor HTTP ni instalar paquetes. Crea solo el documento ausente; repetir conserva revisión y grants. No se inicializa automáticamente desde una lectura HTTP. Si falla, corregir configuración/conectividad y repetir; no borrar ni sobrescribir revisiones. No habilita acceso organizacional hasta disponer de su proveedor.

Prueba aislada: establecer `MONGODB_TEST_URI` a una base terminada en `_test` y ejecutar `npm --prefix backend run test:integration`. La prueba de política usa una base aleatoria propia y la elimina al finalizar; nunca apunta a datos funcionales.

## Consumo frontend

El transporte protegido compartido obtiene el token en el adaptador, limita destinos a operaciones conocidas dentro de la base API, rechaza redirecciones y mantiene timeout/cancelación. Un 401 invalida sesión; 403/404/503 conservan identidad y usan categorías distintas. Una respuesta 403 de la propia consulta de permisos no dispara reconsulta automática: evita un bucle. Los futuros consumidores de operaciones pueden notificar una denegación para invalidar/actualizar el snapshot.

Zustand mantiene estado `idle/loading/ready/denied/error`, ámbito solicitado, snapshot y caducidad local. Cambiar ámbito con `setContext` vacía permisos antes de consultar y descarta respuestas anteriores mediante generación y AbortController. Logout restablece el ámbito propio. Renovación publica `credentialRevision`, un contador sin credenciales; en renovación se limpia el snapshot y después se recarga. La caducidad de 30 segundos se cuenta desde el comienzo de la consulta, conservadoramente frente al tiempo de red. Pestaña oculta invalida y foco vuelve a consultar.

`ProtectedRoute` compone el guard de sesión existente con autorización; `PermissionGuard` y `usePermission` consumen exclusivamente el snapshot y `eligible` del módulo propietario cuando aplica. `AuthorizedNavigation` filtra un registro de módulos realmente implementados: hoy Inicio y Mi sesión no exigen permiso de negocio. Los menús de administración/flota/facturas se prueban con fixtures, no se publican CRUD ficticios. La selección real de organización sigue perteneciendo a su cambio; su integración llamará `setContext`.

## Verificación y límites

Pruebas unitarias de matriz, coordinación, eventos y contratos viven en `backend/tests/unit/authorization.test.ts`. La integración Organizations/Fleet para invitaciones DRIVER, cambio de roles y hechos de elegibilidad está implementada y probada en la propuesta [`implement-driver-management`](../openspec/changes/implement-driver-management/tasks.md); la guía operativa está en [gestión de conductores](driver-management.md). Invoices, Configuration y entrega a Audit persistente siguen pendientes. No se sustituyen esos propietarios con asociaciones ficticias en runtime.

Vitest frontend usa un único thread aislado: los forks jsdom concurrentes agotaron el plazo de arranque en este equipo. Conserva las mismas pruebas y aislamiento; no se deshabilitan escenarios ni se amplían sus límites de tiempo. Las comprobaciones arquitectónicas agregan ejemplos negativos de acceso al adaptador/persistencia de otro contexto.

## Conductores

`THIRD_PARTY_ADMIN` puede consultar y cambiar estado de conductores en su tercero con `drivers:read` y `drivers:deactivate`. `DRIVER` conserva `drivers:read` en ámbito propio y el backend filtra por su subject y membership activa. Las rutas exigen `scope=organization` y `thirdPartyId`; no hay acceso por empresa o global a esta API. `drivers:update` sigue en el catálogo, pero no habilita edición de identidad mientras no se aprueben campos operativos.

La aceptación de invitación y los cambios de rol sincronizan membership, asociación, Driver e historial en transacción; no cambian Keycloak. La identidad canónica solo se proyecta desde Identity y puede ser nula. Ver [contrato y migración de conductores](driver-management.md).

## Vehículos

La API de vehículos exige contexto de tercero, permiso vigente y capacidades locales efectivas; no confía en roles locales del JWT. Las mutaciones revalidan política, membership, asociación y tercero en transacción con historial duradero. DRIVER falla con 503 si el proveedor MongoDB de asignaciones no está disponible; la desactivación confirma ausencia de asignaciones activas y responde 409 si encuentra una. Véase [Gestión de vehículos](vehicle-management.md) para formatos, unicidad, puertos y límites de integración.
