# Design

## Context

Ver la motivación en [proposal.md](proposal.md). La tabla registra la inspección inicial del 2026-11-09. La implementación fue autorizada posteriormente mediante `$openspec-apply-change implement-authorization`; el estado actual y sus límites se registran en `tasks.md` y `docs/authorization-progress.md`.

| Evidencia local | Consecuencia |
| --- | --- |
| `backend/src/modules/identity/domain/actor.ts`, `application/require-roles.ts` | Existen cuatro roles y un actor con `permissions: []`; `requireRoles` exige todos los roles indicados. No es un motor de permisos. |
| `infrastructure/keycloak/jwt-identity-verifier.ts`, `presentation/authenticated-handler.ts`, `bootstrap/authenticated-endpoint.ts` | JWT/JWKS, issuer, audience, expiración y `sub` ya se verifican. Componer autorización después de esa verificación. |
| `backend/src/shared/presentation/http/errors.ts` | Ya traduce 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 503 de configuración y 500. Extender sin cambiar esos contratos. |
| `frontend/src/modules/authentication`, `src/app/app.tsx` | OIDC, transporte protegido, store y `PrivateRoute` protegen `/session`; no hay permisos efectivos ni selector de contexto. |
| `keycloak/invoices-realm.json`, `docs/authentication.md` | Realm `invoices`, audiencia `invoices-api`, roles no compuestos en `realm_access.roles`, Access Token de 300 segundos. Configuración existente, no dependencia pendiente de creación. |
| `backend/openapi/openapi.json` y pruebas de autenticación | Fuente única OpenAPI 3.1.0 y regresiones reutilizables; no crear otro contrato ni login. |
| Módulos Organizations, Fleet, Invoices, Configuration y Audit reservados | No existen repositorios de asociaciones ni recursos de negocio disponibles para conectar autorización completa. |

### Correspondencia OpenSpec y conflictos

- `initialize-foundations` está en `changes/archive/2026-11-08-initialize-foundations/`; su restricción histórica de Keycloak inactivo ya fue reemplazada en código por autenticación. Las deltas de `implement-authentication` aún no están sincronizadas; no reintroducir esa restricción ni modificar hoy las specs principales.
- `initial-invoices-app/specs/identity-access` exige rol, asociación y recurso; `organizations` exige contexto validado y ausencia de acceso transitivo. Se concretan en esta delta sin copiar autenticación ni crear capacidades sinónimas.
- `implement-authentication` tiene 27/27 tareas marcadas, no está archivado. `identity-access` aún no existe en las specs principales: esta delta es ADDED con títulos nuevos. Sincronizar autenticación primero cuando se autorice ese flujo; reconciliar después la propuesta inicial por requisito, sin archivar automáticamente sus requisitos solapados.
- P1 de la propuesta inicial se resuelve parcialmente con la matriz siguiente. P2–P5 mantienen decisiones de negocio/auditoría fuera de este incremento; P6 ya tiene implementación. La petición «CRUD restringido» de DRIVER no define eliminación: `invoices:delete` queda pendiente y denegado. CRUD de maestros se interpreta como crear, leer, editar y desactivar; no borrado físico.

## Goals / Non-Goals

**Goals:** decidir acceso mediante evidencia del servidor; conservar el vínculo entre rol, alcance y recurso; negar sin efectos de negocio; permitir pruebas con puertos sustituibles y adopción gradual por módulos.

**Non-Goals:** implementar CRUD de negocio, formularios administrativos, selector de contexto, un gestor de identidades paralelo, contraseñas MongoDB, jerarquías de roles, un motor de expresiones configurables, microservicios, bus de eventos o despliegue. El catálogo habilita contratos para módulos futuros, no afirma que sus endpoints existan.

## Decisions

### 1. Catálogo y matriz inicial normativa

Identificadores exactos y estables `resource:action`, sin comodines ni comparación de prefijos. `R` significa read, `C` create, `U` update, `D` deactivate, `A` associate o assign según recurso. «Confirmado» significa definido por esta solicitud; el progreso de implementación se registra por tarea. `P` significa pendiente y denegado; `—` denegado expresamente. Ningún rol hereda otros.

| Recurso / permisos | APP_ADMIN | COMPANY_ADMIN | THIRD_PARTY_ADMIN | DRIVER |
| --- | --- | --- | --- | --- |
| `companies:create/read/update/deactivate` | C/R/U/D global administrativo | R/U de empresas asociadas | — | — |
| `third-parties:create/read/update/deactivate` | P | C/R/U/D vinculados a empresas autorizadas | R/U de terceros asociados | — |
| `users:create/read/update/associate` | C/R/U/A administrativo global | C/R/A solo administradores de tercero autorizados; U pendiente | P | R perfil propio por `/auth/me`; U pendiente |
| `drivers:create/read/update/deactivate` | P | P | C/R/U/D del tercero autorizado | R perfil propio; C/U/D denegados |
| `vehicles:create/read/update/deactivate` | P | P | C/R/U/D del tercero autorizado | R solo vehículos activos asignados |
| `vehicles:assign`, `vehicles:unassign` | P | P | Ambos en tercero autorizado | — |
| `assignments:read` | P | P | Asignaciones del tercero autorizado | Solo propias activas |
| `invoices:create/read/update/delete` | P | P | R/U en contexto autorizado; C/D pendientes | C/R/U restringidos; D pendiente |
| `parameters:read/update` | Ambos globales | — | — | — |
| `parameters:create/deactivate` (reservados) | P | — | — | — |
| `roles:read/manage` | Ambos globales, catálogo permitido | — | — | — |
| `associations:read/manage` | Ambos globales administrativos | Ambos para relaciones empresa-tercero y administradores de tercero de sus empresas | P | — |
| `audit:read` | P | P | P | — |

Los prefijos de la tabla son abreviaturas documentales; cada combinación es un permiso separado, por ejemplo `companies:create`. Se añaden `vehicles:unassign`, `assignments:read` y `associations:read/manage` para no ocultar operaciones distintas bajo permisos genéricos. `parameters:create/deactivate` quedan reservados: administrar valores globales existentes está confirmado; creación/baja de definiciones exige política de Configuration. No existe `parameters:delete` ni borrado físico implícito. `invoices:delete` se reconoce en el catálogo pero no se concede a nadie.

La consulta administrativa global se limita a empresas, usuarios, asociaciones y política de permisos. No existe permiso comodín de consulta global que permita leer facturas, flota o terceros. `audit:read` no se concede por ser administrador. Los permisos pendientes no se pueden activar mediante una edición de configuración.

APP_ADMIN invita COMPANY_ADMIN mediante users:associate y associations:manage; COMPANY_ADMIN invita THIRD_PARTY_ADMIN en sus terceros autorizados con esos permisos. THIRD_PARTY_ADMIN invita y gestiona DRIVER con los permisos existentes drivers:create/read/update/deactivate según operación. El registro autónomo ocurre en Keycloak; aceptar activa pertenencia y roles locales conforme a implement-user-invitations. Se deniega autoescalamiento, delegación APP_ADMIN y cualquier rol fuera de la facultad del actor. No se amplía ni resembra la matriz.

Para DRIVER, `invoices:create` admite captura manual y QR solo con vehículo activo y asignación activa al actor en ese contexto; `invoices:read` exige propiedad por `subject`; `invoices:update` exige además origen MANUAL y elegibilidad temporal. QR nunca es editable por DRIVER. La edición QR por otros roles no recibe excepción automática: queda sujeta a la política de Invoice Management. Tener otro rol no amplía el alcance del permiso de DRIVER; solo un grant independiente, explícito y completo puede habilitar otra operación.

### 2. Modelo de decisión y múltiples roles

Tipos puros mínimos en Identity & Access: `Role` reutiliza `ApplicationRole`; `Permission` representa el catálogo; `OrganizationScope` representa ámbito solicitado/verificado; `AuthorizationPolicy` evalúa grants; `AuthorizationDecision` devuelve allowed/denied y motivo interno. Excepciones sin HTTP para falta de permiso, contexto inválido, recurso no disponible y dependencia indisponible. Evitar clases sin comportamiento y repositorio universal.

Un grant contiene `(rol, permiso, clase de alcance, restricciones)`. La decisión es:

`identidad válida AND existe grant completo (APP_ADMIN verificado global o rol local vigente de membership aceptada/LEGACY activa AND permiso habilitado AND vínculo funcional activo para ese rol y alcance AND recurso compatible) AND reglas del módulo propietario`. Fuente local reconciliada por `implement-user-invitations`; no se exige el rol organizacional en realm_access.

La unión de varios roles ocurre sobre grants completos, nunca combinando el permiso de un rol con la asociación de otro. Una asociación empresa-tercero no habilita tránsito automático a recursos del tercero. APP_ADMIN recibe excepción global solo para los permisos administrativos expresos de la matriz; no requiere asociación local para esos permisos. El alcance propio utiliza `subject`, nunca un `userId` libre del cliente. Ausencia de contexto no significa global.

Las asociaciones necesitan capacidad funcional local (administración de empresa, de tercero o conducción), sujeto, organización, estado, versión y membership activa aceptada o LEGACY. Organizations posee los roles organizacionales y sus relaciones; Identity consume sus hechos. COMPANY_ADMIN en A y DRIVER en B no autoriza administrar B.

Se rechazan roles desconocidos, permisos desconocidos, asociación inactiva, contexto incompleto, evidencia ausente y permisos pendientes. Consultas deben aplicar filtro de alcance antes de paginar, contar o agregar. Leer/escribir por ID utiliza filtro de propietario/contexto en el acceso a datos; no filtrar después de traer datos globales. Cambiar un propietario en el cuerpo no altera el hecho de propiedad leído del servidor.

### 3. Casos de uso y arquitectura

| Capa | Backend | Frontend |
| --- | --- | --- |
| Domain | Catálogo, grants, alcances y decisiones puras; sin JWT, Mongoose, Zod ni Next.js. | Tipos de snapshot y permiso; sin replicar matriz ni invariantes de negocio. |
| Application | `GetUserPermissions` consulta política por roles; `GetEffectivePermissions` añade alcance; `CheckPermission` decide sobre hechos; `AuthorizeResourceAccess` coordina pertenencia/reglas; `UpdateRolePermissions` limita cambios al techo confirmado y exige auditoría/versionado. | Caso de uso para cargar/invalidar permisos por sesión/contexto mediante puerto; no usa Zustand, React ni SDK. |
| Infrastructure | Reutilizar verificador JWT; adaptador de política MongoDB; consumir el contrato público de Organizations implementado allí con Mongoose; puertos de hechos de Fleet/Invoices y de Audit. | Adaptador HTTP sobre cliente protegido existente, validación Zod del DTO; sin interpretar claims como permisos. |
| Presentation | Validación DTO Zod, wrappers de permiso/contexto/recurso, traducción central de errores. Route Handlers solo delegan a composición. | Zustand sin persistencia, `ProtectedRoute` componiendo `PrivateRoute`, `PermissionGuard`, hooks, navegación y pantalla de acceso denegado MUI. |
| Composición | `backend/src/bootstrap` conecta puertos concretos; `src/app/api/auth/permissions/route.ts` será el único endpoint nuevo. | `frontend/src/app` conecta sesión, consulta de permisos y futura notificación de contexto. |

La política `requireRoles` conserva su semántica existente; no sustituye autorización por permiso. El actor autenticado no almacena permisos organizacionales mutables: su campo actual `permissions: []` permanece sin autoridad; se calcula un resultado separado por solicitud. SRP separa identidad/decisión/transporte; OCP admite adaptadores compatibles; LSP se verifica con suites de contrato; ISP limita cada puerto; DIP mantiene frameworks fuera de capas internas. Extender controles arquitectónicos existentes, sin introducir un framework de autorización.

La política inicial se persiste con versión en MongoDB mediante inicialización idempotente explícita, sin sobrescribir revisiones existentes. Catálogo y techo de grants confirmados pertenecen a la versión de aplicación; configuración solo puede habilitar/deshabilitar dentro de ese techo. `UpdateRolePermissions` exige `roles:manage`, compara versión esperada y registra cambio duradero; ni roles arbitrarios, ni comodines, ni alcances mayores, ni permisos pendientes. No se añade API de escritura en este incremento. La gestión de roles locales pertenece a Organizations conforme a implement-user-invitations; APP_ADMIN permanece global en Keycloak.

No guardar passwords, tokens ni listas de roles por usuario en MongoDB. No copiar asociaciones dentro de la política. Si falta política inicial o falla persistencia, las operaciones dependientes quedan indisponibles, sin fallback permisivo. `/api/auth/me` y servicios técnicos conservan independencia de MongoDB.

### 4. Contratos con organizaciones y recursos

`OrganizationAccessReader` recibe sujeto verificado y contexto solicitado `{companyId?, thirdPartyId?}`; devuelve organizaciones y asociaciones activas, capacidades funcionales, versión/revisión y relación empresa-tercero cuando se suministran ambos IDs. Cero IDs no es contexto organizacional válido. Un tercero aislado puede ser ámbito explícito si su asociación directa lo permite; no se presupone una jerarquía única empresa-tercero. Si se especifica empresa y tercero, la relación activa entre ambos es obligatoria y no basta para conceder acceso al tercero.

La futura selección de contexto pertenece a `implement-organization-context` bajo la capacidad existente `organizations`. Autorización consume su contrato y eventos de cambio de UI, no crea selector, sesión de contexto ni `GET /api/auth/context`. Cada solicitud transporta contexto explícito y lo revalida; un snapshot o revisión nunca es credencial ni prueba transferible de autorización.

Puertos de lectura de recurso devuelven ID, tipo, organizaciones propietarias, estado, propietario `subject` y revisión mínima según recurso. Fleet entrega asignación activa y vínculo conductor/vehículo/tercero. Invoices entrega origen, propietario y resultado de elegibilidad; Configuration y reloj del servidor sustentan el cálculo temporal dentro de Invoices. No duplicar duración, referencia temporal, borde ni parsing QR en Identity.

Sin estos adaptadores se pueden verificar políticas con dobles y operar permisos globales/propios independientes, pero la consulta organizacional real devuelve 503 `AUTHORIZATION_UNAVAILABLE`. No registrar adaptadores ficticios que autoricen en runtime. Los endpoints de negocio futuros deberán integrar autorización y sus invariantes antes de exponerse.

Para mutaciones, el módulo propietario debe revalidar las revisiones de autorización/asociación/recurso en su punto de confirmación; revocación concurrente invalida la decisión previa. Los contratos deben permitir una garantía de serialización/versión compartida con Organizations, sin lecturas de modelos ajenos. Su implementación de persistencia es dependencia del módulo propietario: hasta demostrarla, la mutación no se habilita. Una petición denegada no escribe datos de negocio; sí puede registrar su evento de seguridad.

### 5. Contrato REST mínimo

Único endpoint nuevo: `GET /api/auth/permissions`. Requiere el Bearer existente; cualquier identidad válida puede consultar sus propios permisos, incluso sin roles (arreglo vacío). No acepta sujeto, roles o permisos como parámetros. No modifica contexto ni políticas.

Query estricta: `scope=self|global|organization` (opcional, por defecto `self`); `companyId` y `thirdPartyId` solo se admiten en `organization`, como identificadores opacos no vacíos de máximo 128 caracteres, sin duplicados. El ámbito organizacional exige al menos un ID. Parámetros desconocidos, combinación inválida o repetidos: 400 `INVALID_REQUEST`. Global requiere grant administrativo global; usuario sin él: 403. `self` no incluye permisos organizacionales por omisión. IDs manipulados o inaccesibles en la consulta de contexto: 403 neutro, sin revelar cuál asociación existe.

Ejemplo de respuesta para DRIVER en contexto válido, sujeto a la política activa:

```json
{
  "subject": "subject-ejemplo",
  "scope": { "kind": "organization", "companyId": "company-a", "thirdPartyId": "third-party-a" },
  "permissions": ["vehicles:read", "assignments:read", "invoices:create", "invoices:read", "invoices:update"],
  "policyVersion": "7",
  "contextRevision": "12",
  "evaluatedAt": "2026-11-09T18:00:00Z",
  "refreshAfterSeconds": 30
}
```

Todos los campos son obligatorios; `scope` tiene `kind` enum e IDs `string|null` (null en self/global); `contextRevision` es `string|null`, null cuando no hay contexto. `permissions` es arreglo único del enum estable. `subject` corresponde a `sub`, sin perfil adicional. `policyVersion` es opaco y no vacío; `evaluatedAt` es UTC date-time; `refreshAfterSeconds` es entero fijo 30. Objetos cerrados con `additionalProperties: false`. Un permiso en este snapshot permite mostrar una acción candidata, no garantiza acceso a cualquier instancia ni confirma asignación/ventana de una factura. Permisos propios de perfil se consultan en `self` y no se mezclan con otro alcance.

| HTTP | Semántica y envelope |
| --- | --- |
| 200 | Snapshot, aun si no existen permisos para una identidad/contexto válido. |
| 400 | `error.code=INVALID_REQUEST`, formato inválido tras autenticar. |
| 401 | `UNAUTHENTICATED`, contrato existente, `WWW-Authenticate: Bearer`. |
| 403 | `FORBIDDEN`, falta de autorización para el ámbito; mensaje existente neutro. |
| 503 | `CONFIGURATION_ERROR` antes de autenticación si configuración inválida; `AUTHORIZATION_UNAVAILABLE` si no puede obtenerse evidencia confiable de autorización. |
| 500 | `INTERNAL_ERROR`, fallo inesperado sin detalles internos. |

JSON y `Cache-Control: no-store` para todas las respuestas. Recursos de negocio por ID usarán 404 `RESOURCE_NOT_FOUND` idéntico para inexistente o fuera de alcance tras validar identidad y contexto. Falta de permiso sobre una operación/listado o contexto inaccesible: 403 sin consultar existencia del recurso. En listados autorizados vacíos: 200 sin resultados ajenos. Reglas de negocio rechazadas en un recurso visible conservarán el contrato de su módulo; no convertir toda invariante en 403.

OpenAPI se extenderá en la fuente única existente: seguridad Bearer por operación, query/esquemas anteriores, respuestas/headers, ejemplos sintéticos y extensiones `x-required-permissions` y `x-authorization-scope` para describir restricciones sin inventar scopes OAuth. Para `/permissions`, `x-required-permissions: []` significa consulta propia autenticada, no API pública. Mantener `/me` sin nuevo requisito de rol y health/docs/openapi públicos. No documentar CRUD futuros como endpoints disponibles; su adopción exigirá la misma metadata y pruebas de inventario que fallen ante un handler privado sin protección explícita.

### 6. Keycloak, revocación y cachés

Keycloak mantiene identidad y APP_ADMIN global. Organizations mantiene memberships y roles organizacionales locales; los roles antiguos del proveedor pueden conservarse durante migración, pero no autorizan operaciones locales. La aplicación mantiene el catálogo y relación rol-permiso sin resembrarlos. No aceptar privilegios enviados desde React. Esta fuente sustituye el diseño anterior conforme a `implement-user-invitations`.

- Cambios en APP_ADMIN del proveedor se observan con un Access Token nuevo; el anterior conserva la ventana de 300 segundos más 30 de tolerancia. Los roles organizacionales locales se revalidan en la siguiente petición incluso con token antiguo. No implementar logout forzado ni notificación de cambios.
- La renovación ya existente se reutiliza; después de renovar, consultar nuevamente permisos. Una notificación interna sin credenciales permite invalidar el snapshot aunque el estado siga `authenticated`. Fallo de refresh o logout elimina permisos y solicitudes pendientes.
- Políticas y asociaciones se leen del almacenamiento autoritativo en cada decisión; sin caché backend de decisiones positivas entre peticiones. Una revocación confirmada afecta las solicitudes siguientes. Mutaciones concurrentes respetan el punto de confirmación descrito en §4.
- Frontend refresca al autenticar, renovar token, cambiar contexto, volver a foco, recibir 403 y cada 30 segundos mientras la vista está activa. Un snapshot vencido queda no disponible hasta recarga; pestañas en segundo plano limpian/validan al recuperar foco. La caché de UI no extiende permisos backend.
- Si una política, asociación o evidencia necesaria no puede consultarse, no autorizar ni reutilizar un resultado anterior. Distinguir denegación de indisponibilidad; no cerrar sesión por un 403/503.

Elegir esta consistencia acotada conserva el modelo JWT de autenticación. La alternativa de revocación inmediata mediante introspección/lista de revocación es otro cambio, no una garantía implícita de este diseño.

### 7. Estado y experiencia frontend

Store de autorización separado lógicamente del store de sesión, dentro del módulo existente `authentication`: `idle|loading|ready|denied|error`, snapshot, ámbito, generación de sesión/contexto y caducidad local. Sin persistencia, tokens o SDK. Cada carga captura generación y AbortSignal; cambio de usuario/contexto incrementa generación y vacía permisos antes de solicitar. Una respuesta tardía del contexto A no repuebla B, tampoco tras logout.

`ProtectedRoute` compone `PrivateRoute`: identidad primero, permisos después. Mientras se inicializa/carga o hay error, no renderiza contenido privado ni habilita acciones; 403 muestra acceso denegado sin bucle de login; 401 usa invalidación ya existente. `PermissionGuard` y hooks consultan grants del backend para ruta, menú y acciones. DRIVER no ve administración de empresas; THIRD_PARTY_ADMIN solo ve módulos de su contexto. Para botones sobre instancias, combinar permiso con elegibilidad pública suministrada por el módulo, sin calcular ventana/origen/autorización exclusivamente en UI.

No crear pantallas de negocio para demostrar estos controles. Usar rutas/componentes de prueba y la pantalla de sesión existente para verificación técnica; el menú mostrará únicamente módulos realmente implementados. El futuro selector invoca el contrato de cambio de contexto; en esta entrega se prueba con dobles y se conecta cuando exista.

### 8. Auditoría y operaciones sensibles

Puerto de Audit para hechos inmutables: `eventId`, instante del servidor, actor `subject` o actor de servicio verificable, acción, resultado, motivo interno categórico, contexto validado cuando exista, tipo/ID de recurso seguro, versiones antes/después y correlación. Nunca registrar Authorization, tokens, passwords, claims completos, payloads arbitrarios ni IDs ajenos no verificados. Los IDs internos se minimizan y no se devuelven en errores.

Registrar denegaciones de permisos/contexto/recurso con deduplicación y límite de frecuencia, conservando contadores de supresión; fallar al registrar una denegación no cambia la respuesta de rechazo. Registrar sin muestreo cambios de política, asociaciones, roles y operaciones administrativas sensibles. Para cambios autorizados, persistencia/captura duradera antes de éxito; si falla, no confirmar la operación. El adaptador de política puede guardar revisión y evento pendiente en una actualización atómica del mismo documento, con ID estable y entrega idempotente al puerto de Audit; no requiere un bus. La entrega y retención se conectan al módulo Audit cuando exista; no se habilitan cambios de política sin captura duradera verificable.

Organizations registra sus cambios de asociaciones y los módulos administrativos sus operaciones mediante el mismo contrato. Cambios de roles realizados directamente en Keycloak necesitan eventos administrativos del proveedor y recolección verificable antes de declarar cobertura integral. No inferir que observar un token nuevo prueba cuándo/quién cambió el rol. Esa integración pertenece al trabajo futuro de auditoría/identidades; aquí se define y prueba el contrato de ingestión con eventos sintéticos, sin modificar hoy Keycloak. Retención y acceso al historial siguen pendientes; `audit:read` permanece denegado.

### 9. Dependencias y decisiones que no conceden permisos

| Dependencia / decisión | Estado y efecto |
| --- | --- |
| Foundations archivado | Reutilizar capas, pruebas y OpenAPI; ninguna reinstalación necesaria para planificar. |
| `implement-authentication` | Código disponible; sincronización documental pendiente de su propio flujo. Conservar contrato JWT, `/me`, sesión y roles. |
| `implement-organization-context` / `organizations` | Cambio aún inexistente. Debe proporcionar asociaciones con capacidad local, revisión, lectura consistente y selector. Bloquea adaptador organizacional real y aceptación integrada, no políticas puras. |
| P1: administración operativa global y permisos «según política» | Pendientes; ninguna concesión para esas celdas. Añadirlas exige nueva decisión de producto y actualizar matriz/specs/techo. |
| P1: cardinalidades y delegación adicional | No inferir jerarquías ni permisos transitivos. Flujo confirmado de delegación limitado a §1; demás denegado. |
| P2/P3: ventana manual, campos QR y excepciones de otros roles | Propiedad de Configuration/Invoices. DRIVER QR queda prohibido; pruebas de autorización usan resultados de elegibilidad, no inventan horas ni campos. |
| P4: referencia temporal e historial de asignaciones | Propiedad de Fleet/Invoices; nunca autorizar vehículo inactivo o asignación inactiva al registrar. Reglas históricas adicionales se resuelven allí. |
| P5: Audit, retención e ingestión Keycloak | Garantía mínima duradera exigida; integración real y retención son trabajo del módulo propietario. No declarar auditoría integral hasta conectarla. |
| P7: concurrencia de recursos y asociaciones | Puerto exige comprobación al confirmar; adaptación concreta depende de persistencia del propietario. Bloquea habilitar mutaciones afectadas. |
| Eliminación de facturas, edición de perfil y alta/baja de definiciones de parámetros | Pendientes, denegadas; no forman parte de implementación autorizable por defecto. |

Estas decisiones pendientes solicitadas por el usuario tienen un resultado seguro definido: denegación o dependencia explícita. No son preguntas que impidan redactar esta propuesta. Cambiar ese resultado requiere revisar los artefactos del módulo correspondiente.

### 10. Pruebas y aceptación

| Criterio | Evidencia futura y responsable |
| --- | --- |
| A1 Todos los endpoints privados autentican | Regresión de JWT ausente/inválido/expirado, wrapper e inventario; reutilizar suites de autenticación. |
| A2 Permisos comprobados en backend | Casos positivos/negativos de catálogo, matriz, usuario sin roles y varios roles; petición HTTP directa sin UI. |
| A3 Contexto validado por solicitud | Múltiples organizaciones, contexto omitido/manipulado, relación empresa-tercero y capacidades funcionales. |
| A4 Sin acceso horizontal | Lectura, listado/conteo y mutación contra empresa/tercero ajenos; 404 neutro y cero efectos. |
| A5 Roles y permisos explícitos | Tabla completa como pruebas parametrizadas, sin comodines ni APP_ADMIN operativo implícito; roles desconocidos ignorados. |
| A6 Asociaciones inactivas no conceden acceso | Revocación entre solicitudes y conflicto concurrente en confirmación; contrato real de Organizations. |
| A7 UI solo muestra acciones autorizadas | Guards, hooks y menú para DRIVER/THIRD_PARTY_ADMIN, carga/error, contexto y respuesta tardía; Vitest/Playwright. |
| A8 Lógica reutilizable/testeable | Decisiones y casos de uso con dobles compatibles; misma suite de contrato en adaptadores. |
| A9 SOLID/DDD/Clean Architecture | Controles existentes en ambas aplicaciones y casos negativos; sin imports cruzados ni frameworks internos. |
| A10 Swagger refleja restricciones | Lint 3.1, validación DTO/respuestas HTTP, seguridad y metadata por operación. |
| A11 Rechazo no modifica negocio | Espías de repositorio y prueba MongoDB aislada que compare estado anterior/posterior; auditoría de denegación es efecto permitido. |
| A12 Cambios de acceso tienen semántica comprobable | Reloj controlado para rol retirado/token viejo/nuevo, política revisada, asociación revocada, refresh y límite de UI. |

Autorización prueba que se exige evidencia de vehículo/asignación activos, factura propia, MANUAL y elegibilidad temporal. Fleet/Invoices/Configuration prueban el cálculo real de estado, plazo, borde temporal, captura QR y concurrencia de sus agregados. Integraciones cruzadas usan fixtures reales solo cuando esos módulos existan; no marcar escenarios funcionales completos mediante dobles. Una factura QR de DRIVER o MANUAL fuera de plazo nunca solicita escritura, incluso con `invoices:update`.

## Risks / Trade-offs

- [Dependencias funcionales no implementadas] → Entregar núcleo y contratos comprobables; mantener bloqueadas integraciones afectadas y no declarar aceptación completa.
- [Roles JWT conservados hasta expiración] → Ventana explícita de hasta 330 segundos bajo configuración inspeccionada y regresión de token nuevo/viejo.
- [Lecturas de asociaciones/política por solicitud] → Coste adicional aceptado para revocación sin caché positiva; optimizar solo manteniendo el contrato.
- [Unión accidental de roles y ámbitos] → Grants indivisibles, capacidades locales y pruebas de COMPANY_ADMIN en A/DRIVER en B.
- [Carrera entre comprobar y escribir] → Revisión/serialización en confirmación; no habilitar mutaciones sin garantía verificable del propietario.
- [Auditoría aparente de cambios externos] → Exigir eventos Keycloak y evidencia de recolección; no atribuir cambios a partir del JWT.
- [Archivar propuestas solapadas] → Sincronización de autenticación antes y reconciliación explícita de títulos; no aplicar automáticamente `initial-invoices-app`.

## Migration Plan

La implementación autorizada sigue esta secuencia: introducir catálogo/políticas y pruebas; persistencia de política inicial idempotente; conectar contratos disponibles; exponer consulta y controles frontend; completar integraciones dependientes y aceptación. No hay datos funcionales actuales que migrar ni roles de usuario que copiar. Registrar el estado parcial real si alguna dependencia sigue ausente.

No desplegar en esta propuesta. En una entrega futura, retirar el incremento implica deshabilitar los endpoints funcionales dependientes antes de retirar sus controles; nunca volver a exponerlos sin autorización. Conservar auditoría y revisiones; revertir política mediante una nueva revisión auditada dentro del techo, sin borrar historial ni volúmenes. Autenticación y servicios técnicos existentes deben seguir funcionando.
