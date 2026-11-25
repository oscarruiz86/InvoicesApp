# Design

## Context

Motivación en [proposal.md](proposal.md). Inspección local del 2026-11-10; estado observado, no aceptación ejecutada en esta propuesta:

| Evidencia | Estado y consecuencia |
| --- | --- |
| `openspec/changes/initial-invoices-app` | 0/36 tareas; arquitectura objetivo, no implementación completa. Su delta organizations define propiedad e invariantes que se consumen aquí. |
| `openspec/changes/archive/2026-11-08-initialize-foundations` | Foundations archivado; la ruta activa solicitada ya no existe. Manifiestos, capas, conexión MongoDB, pruebas y OpenAPI disponibles. |
| `implement-authentication`, `modules/identity/infrastructure/keycloak`, frontend `modules/authentication` | 27/27 tareas; JWT validado, actor, OIDC, transporte protegido, logout y sesión existentes. No archivado. |
| `implement-authorization/tasks.md`, `docs/authorization-progress.md` | 24/32 tareas; pendientes 3.5, 6.1–6.6 y 7.2. No interpretar pruebas con dobles como integración funcional completa. |
| `identity/domain/authorization-facts.ts`, `application/authorization-ports.ts` | Ya existen OrganizationScope, OrganizationEvidence, LocalCapability, OrganizationAccessReader y AuthorizedMutation. Reutilizar semántica y contratos. |
| `bootstrap/authorization-endpoint.ts` | El lector organizacional lanza AuthorizationUnavailable; este cambio aporta su proveedor real. Repositorio de política Mongoose ya existe. |
| `identity/application/authorization.ts`, `domain/authorization-policy.ts` | getEffectivePermissions, grants completos, validación de asociación y comprobaciones de recursos ya implementados. No copiar la matriz. |
| `authentication/presentation/authorization-store.ts` | setContext, invalidación, abort, generación y refresh cada 30 segundos ya disponibles; consumirlos. |
| `frontend/src/app/app.tsx` | Inicio, callback, session y fallback; todavía no hay dashboards de negocio ni selector. |
| Inventario `backend/src` | No hay modelos de empresas, terceros, asociaciones, flota, facturas ni Audit real. Solo política de autorización y conexión MongoDB. |
| `openspec/specs` | Solo backend-runtime, frontend-shell y local-development de foundations. Deltas de autenticación/autorización sin sincronizar; restricciones históricas de Keycloak inactivo no describen el código actual. |

No se alteran otros cambios ni specs principales. Al sincronizar posteriormente, reconciliar primero autenticación y luego autorización; mantener las invariantes de organizations y referenciar organization-context para su flujo, sin duplicar títulos ni archivar initial-invoices-app por equivalencia.

## Goals / Non-Goals

**Goals:** contexto explícito, verificable y aislado por pestaña; resolver asociaciones reales sin ciclos entre módulos; aprovechar permisos y sesión existentes; garantizar transición visual sin datos anteriores y pruebas reproducibles.

**Non-Goals:** crear otro motor de permisos, sesión backend de autenticación, jerarquías implícitas empresa-tercero o rol APP_ADMIN omnipotente; ejecutar CRUD, implementar elegibilidad de facturas o confirmar mutaciones de módulos todavía ausentes.

## Decisions

### 1. Modelo y correspondencia con autorización

OrganizationContext es una vista resuelta, no agregado persistido ni credencial. Unión discriminada:

- Organizacional: `kind: ORGANIZATION`, `organizationId`, `organizationType: COMPANY|THIRD_PARTY`, `organizationName`, `roles` aplicables y `authorization` con el PermissionsSnapshot existente.
- Global: `kind: GLOBAL`, `roles` globales aplicables y `authorization` global; sin ID, nombre o tipo de organización ficticios.
- Sin selección: null en frontend. Nunca equivale a GLOBAL ni a `self`; self permanece como ámbito de perfil en Identity.

Mapeo exacto: COMPANY → `{kind: organization, companyId: id, thirdPartyId: null}`; THIRD_PARTY → `{kind: organization, companyId: null, thirdPartyId: id}`; GLOBAL → `{kind: global, companyId: null, thirdPartyId: null}`. El selector no introduce pares empresa-tercero: el contrato existente de permisos sí los admite y el lector debe seguir validando relación activa y capacidades para ambos IDs. No se presupone empresa padre única.

`roles` se deriva de capacidades locales activas de memberships aceptadas o migradas LEGACY activas y grants completos habilitados, sin intersección con roles organizacionales del token, conforme a `implement-user-invitations`. `authorization.permissions` conserva su caducidad informativa. Se exige al menos un grant efectivo para ofrecer contexto. No unir COMPANY_ADMIN en A con DRIVER en B. Una pertenencia propia a tercero permite seleccionarlo sin empresa padre; una capacidad limitada a un par no se amplía a tercero aislado.

APP_ADMIN usa GLOBAL si tiene un grant global activo. No recibe todos los contextos del sistema por su rol. Para entrar operativamente en empresa/tercero necesita además el rol operativo y capacidad local que la política actual acepta. Una futura excepción administrativa operativa requerirá cambiar explícitamente la política de autorización, fuera de este incremento.

### 2. Datos mínimos bajo propiedad de Organizations

| Documento propuesto | Campos mínimos y garantías |
| --- | --- |
| `organizations` | `id` opaco único, `type`, `name`, `active`, `revision` monotónica, `updatedAt`. Una colección con discriminante basta para lectura de empresas/terceros; no añade datos fiscales ni CRUD. |
| `organization_associations` | `id`, `subject` de Keycloak, `organizationId`, `capability: COMPANY_ADMIN|THIRD_PARTY_ADMIN|DRIVER`, `active`, `revision`, `updatedAt`. Índice único `(subject, organizationId, capability)`; índice de consulta `(subject, active, organizationId)`. COMPANY_ADMIN solo con COMPANY; los otros dos solo con THIRD_PARTY. |
| `company_third_party_relations` | `companyId`, `thirdPartyId`, `active`, `revision`, `updatedAt`; pareja única y referencias del tipo correcto. Solo soporta el contrato existente de lectura de pares; no concede acceso transitivo. |

Varias capacidades pueden coexistir en una organización y varias asociaciones en cada tipo; deduplicar destinos por tipo e ID. No persistir roles globales de usuario, permisos efectivos, tokens ni passwords. No hay colección de contexto activo.

`contextRevision` es una codificación opaca y determinista de revisiones de organización, asociaciones relevantes y relación cuando corresponda; cambia ante cualquier cambio relevante y nunca se acepta del cliente como autorización. El lector obtiene evidencia coherente mediante lectura snapshot cuando el despliegue la soporte o comprobación de revisiones antes/después con reintento acotado; si no converge responde indisponibilidad. Los escritores futuros deben incrementar revisiones; una escritura directa sin ese contrato no es un procedimiento soportado.

Para pruebas se crean fixtures únicamente en base aislada `_test`. Para uso funcional se necesita un mecanismo de provisión administrativo autorizado del propietario Organizations: esta propuesta no lo simula ni agrega importación que eluda permisos. Sin registros se muestra estado vacío; sin política inicial o persistencia disponible, 503. Los adaptadores de lectura no inicializan datos al atender solicitudes.

### 3. Capas, puertos y ausencia de ciclos

Backend `modules/organizations`:

- Domain: OrganizationType, OrganizationAssociation, contexto y política de validez estructural; errores puros de contexto inválido/no disponible. OrganizationScope conserva el contrato público existente de Identity, sin una segunda semántica. No imports de Next.js, Mongoose, Zod o Keycloak.
- Application: GetAvailableOrganizationContexts, ResolveOrganizationContext y ValidateOrganizationContext coordinan repositorios y un puerto estrecho de resolución de permisos. Select/Switch son operaciones de interacción que reutilizan Resolve; GetActive restaura por Resolve y Clear es local. No crear seis servicios vacíos para imitar nombres conceptuales.
- Infrastructure: repositorios Mongoose de las tres colecciones, mapper de evidencia y adaptador de permisos. El lector público de hechos de Organizations no llama a Identity; un puente externo implementa OrganizationAccessReader y solo lee hechos. La composición inyecta ese lector en Authorization y luego inyecta Authorization como resolver en los casos de uso de contexto. Así no hay dependencia circular de imports ni recursión de llamadas.
- Presentation: DTO Zod cerrados, respuesta y traducción de errores; Route Handlers delegan a bootstrap y usan authenticatedEndpoint. El `subject` proviene exclusivamente del actor JWT validado.

Frontend `modules/organization-context/{domain,application,infrastructure,presentation}`: tipos/puertos puros, casos de uso de inicio/selección/cambio/restauración/limpieza, adaptador HTTP sobre protected-http y adaptador de preferencia sessionStorage. Presentation contiene store, hooks, OrganizationSelectionPage, OrganizationSelector, OrganizationCard, ActiveOrganizationIndicator y OrganizationContextGuard. No Provider adicional salvo necesidad demostrada de inyección; composición en `src/app` como actualmente.

SRP separa hechos, decisión, transporte y UI; DIP con puertos específicos; LSP con pruebas de contrato; OCP mediante adaptadores; ISP sin repositorio universal. Las reglas de arquitectura existentes verifican capas, ciclos e independencia entre aplicaciones. No importar modelos de Organizations desde Identity.

### 4. Persistencia: contexto explícito por solicitud

| Opción | Beneficios | Costes / decisión |
| --- | --- | --- |
| Sesión backend con cookie y contexto único | Restauración central | Nueva sesión, concurrencia entre pestañas, persistencia/CSRF y acoplamiento no necesarios. Descartada. |
| IDs explícitos, solo memoria | Encaja con autorización actual, pestañas independientes | Pierde preferencia al recargar. Insuficiente para restauración solicitada. |
| IDs explícitos + preferencia sessionStorage por pestaña | Sin sesión adicional, restauración y pestañas independientes | Preferencia manipulable: validar siempre. Recomendada. |

Guardar únicamente `{subject, kind, organizationId?, organizationType?}` versionado en sessionStorage; subject separa cuentas, no autentica. No localStorage, nombres, roles, permisos ni tokens. Ante almacenamiento bloqueado, funcionar en memoria; al recargar se repite selección y se explica la limitación sin conceder acceso. Nueva pestaña comienza sin selección; si el navegador duplica sessionStorage, revalidar la copia y permitir cambios independientes.

Cada operación protegida captura una copia inmutable del scope al iniciar. Permisos usa la query existente; futuros endpoints operativos declaran un solo transporte de contexto en su contrato, nunca inferir GLOBAL de ausencia. No agregar cookies ni modificar JWT. Cambiar A→B en una pestaña no revoca la asociación A ni impide usar A en otra: se impide que la interfaz B reutilice solicitudes/datos A. Un cliente puede solicitar A explícitamente mientras siga autorizado.

401 o logout vacían preferencia, contexto, permisos y datos. Emitir notificación local entre pestañas sin credenciales para limpiar al logout, sin sincronizar selecciones. Al volver a foco y en renovación/caducidad de permisos, revalidar; una asociación revocada se rechaza en la siguiente solicitud backend aunque la UI aún no haya refrescado. Ocultar contenido mientras se revalida. Revocaciones en curso se tratan en §8.

### 5. Entrada después del login y navegación

1. Reutilizar sesión Keycloak y `/api/auth/me`; no seleccionar hasta confirmar identidad.
2. Si hay preferencia del mismo subject, resolverla otra vez. Si es válida, restaurar; si 403, borrarla y consultar destinos. 401 invalida sesión; red/503 deja pantalla de reintento, sin auto-login.
3. Sin preferencia válida, consultar disponibles. Si hay GLOBAL autorizado, entrar a GLOBAL por defecto; esto es excepción explícita para administrador global. El selector ofrece sus organizaciones adicionales autorizadas.
4. Sin GLOBAL: cero organizaciones → mensaje sin asociaciones/contextos autorizados, reintentar y logout; una → resolver automáticamente sin pantalla intermedia; dos o más → pantalla de selección, sin elegir la primera.
5. Resolver selección, cargar permisos mediante `authorization.setContext(scope)` y publicar contexto solo si scope, sesión y generación coinciden. Si permisos cambian entre ambas consultas, se utiliza el snapshot más reciente; si queda vacío se vuelve a selección/estado vacío.
6. Destino inicial `/session`, enriquecido con indicador/contexto y navegación disponible; funciona como resumen provisional. No inventar dashboards de facturas o flota. Cuando existan, el registro de rutas autorizadas permitirá el dashboard correspondiente; retorno solo a rutas locales válidas para el contexto, nunca URL arbitraria.

Rutas propuestas `/organizations/select` y `/session`; pantalla vacía/error dentro del flujo. PrivateRoute resuelve autenticación, OrganizationContextGuard exige contexto para módulos organizacionales y ProtectedRoute/PermissionGuard aplican permisos. Rutas globales no requieren organización y exigen permiso global. Deep links conservan destino local seguro, pero no evitan la selección ni causan redirecciones infinitas.

Selector mobile-first con marca Invoices App, usuario confirmado, tarjetas de nombre/tipo y roles aplicables, botón seleccionar, carga, error/reintento y logout. Cabecera ofrece cambio e indicador claro GLOBAL/empresa/tercero. Probar 360 y 1280 px, teclado, orden/foco, nombres accesibles, anuncios de estado con lector de pantalla, controles táctiles de al menos 44 px y ausencia de scroll horizontal.

### 6. Cambio seguro y estado frontend

Store de contexto: `status: idle|loading|selecting|switching|ready|empty|error`, activeContext, availableContexts, error y generación. No almacena una segunda lista autoritativa de permisos: consume AuthorizationStore. Adaptador de contexto devuelve nombres/roles y snapshot; la composición usa el store de autorización ya existente para vigencia, refresh y notificación de cambios.

Al abrir selector se consultan destinos frescos. Si hay formularios sucios, pedir confirmación antes de invalidar; cancelar conserva A. Al confirmar: incrementar generación, bloquear acciones, ocultar contenido privado, cancelar solicitudes, invalidar permisos, limpiar cachés/drafts/selecciones de A mediante callbacks registrados por módulos y resolver B. Desmontar la vista organizacional con clave de generación; no confiar solo en abort, pues una respuesta puede llegar igual. Toda publicación exige coincidencia de subject, scope y generación. Dos cambios rápidos solo publican el último.

Solo después de resolución y permisos válidos se guarda preferencia B, se publica B y se navega a destino permitido. Si falla, permanecer sin contexto listo y ofrecer reintento/selección; no restaurar datos ni permisos de A automáticamente. Clear elimina preferencia y datos, mantiene sesión y muestra selector sin autoselección inmediata en esa transición explícita. Solicitudes mutadoras ya recibidas por el backend no se revierten al cambiar UI: pueden terminar en A si estaban autorizadas; su respuesta no actualiza B y no se reintentan automáticamente en B.

### 7. Contratos REST y OpenAPI

Usar `backend/openapi/openapi.json`, OpenAPI 3.1.0, tag `Organization Context`, bearerAuth y `Cache-Control: no-store` en todas las respuestas. DTO con additionalProperties false; IDs opacos no vacíos de hasta 128 caracteres; enums cerrados. Reutilizar PermissionsSnapshot, Permission, OrganizationScope y error envelope existentes, sin crear variantes incompatibles.

| Operación | Entrada y éxito | Errores |
| --- | --- | --- |
| `GET /api/organization-contexts` | Sin query/body. 200 `{organizations: [{organizationId, organizationType, organizationName, roles}], globalAvailable: boolean}`. Conjunto completo deduplicado de destinos autorizados; vacío es 200. | 400 query desconocida/repetida; 401; 503; 500. |
| `POST /api/organization-contexts/resolve` | JSON `{selection: {kind: ORGANIZATION, organizationId, organizationType}, reason: INITIAL|SWITCH|RESTORE}` o selection `{kind: GLOBAL}`. 200 OrganizationContext de §1 con snapshot existente. reason sirve para auditoría de intención, nunca autorización. | 400 esquema/JSON inválido; 401; 403 neutro para inexistente, ajeno, inactivo o sin grants; 503; 500. |
| `GET /api/auth/permissions` existente | Query scope/IDs actual; refresh de permisos para contexto explícito. Contrato sin cambios. | Errores existentes. |

Ejemplo de resolución: `{"selection":{"kind":"ORGANIZATION","organizationId":"third-party-a","organizationType":"THIRD_PARTY"},"reason":"SWITCH"}`. Respuesta: `{"kind":"ORGANIZATION","organizationId":"third-party-a","organizationType":"THIRD_PARTY","organizationName":"Transportes A","roles":["DRIVER"],"authorization":{"subject":"subject-a","scope":{"kind":"organization","companyId":null,"thirdPartyId":"third-party-a"},"permissions":["vehicles:read","assignments:read","invoices:create","invoices:read","invoices:update"],"policyVersion":"1","contextRevision":"r12","evaluatedAt":"2026-11-10T20:00:00Z","refreshAfterSeconds":30}}`. Permisos del ejemplo dependen de política real y no prueban elegibilidad de cada recurso.

Adaptación de endpoints conceptuales: se conserva GET listado; GET active se reemplaza por resolve con reason RESTORE e ID explícito; PUT active por resolve INITIAL/SWITCH; DELETE active por Clear local. Sin estado servidor, GET active sin ID no tendría significado y PUT/DELETE sugerirían persistencia inexistente. No publicar esos tres endpoints ni un login/contexto bajo auth duplicado.

403 usa FORBIDDEN sin distinguir inexistencia de desactivación. 401 usa UNAUTHENTICATED y WWW-Authenticate, 400 INVALID_REQUEST; indisponibilidad de datos/política/auditoría necesaria usa AUTHORIZATION_UNAVAILABLE; configuración usa CONFIGURATION_ERROR y error inesperado INTERNAL_ERROR. 404 RESOURCE_NOT_FOUND se conserva en APIs de recursos para ocultar pertenencia ajena, no para enumerar organizaciones mediante resolve. Documentar ejemplos 200/400/401/403/503/500 y 404 donde corresponda al recurso; no inventar un 404 de active.

### 8. Seguridad, revocación y alcance de recursos

GetAvailable filtra por subject verificado, organizaciones/asociaciones activas, tipo y grants efectivos antes de exponer nombres o contar resultados. No listado administrativo global por ser APP_ADMIN. Resolve reconsulta hechos y política; ninguna lista previa o revisión evita esa lectura. Falta de datos confiables deniega o devuelve 503, nunca usa fixture/fallback permisivo.

El lector existente recibe pares: solo retorna evidencia del mismo subject/scope, verifica ambos estados, relación activa y capacidades locales sin transitividad. `validOrganization` y `checkPermission` siguen siendo autoridades existentes. DRIVER solo obtiene permisos de su capacidad de conducción; Fleet debe comprobar vehículo/asignación activos e Invoices propiedad, origen y elegibilidad. Un cambio no modifica esos hechos ni concede facturas ajenas.

No cachear positivamente asociaciones o política entre solicitudes. Revocación confirmada antes de una nueva validación impide selección/operación. Una resolución ya en vuelo puede terminar con snapshot que queda obsoleto inmediatamente; no es credencial y la siguiente operación revalida. Para mutaciones, AuthorizedMutation exige revisión y escritura serializadas en el punto de confirmación: leer antes/después de autorización no basta. Garantía concreta de bloqueo/versionado compartido corresponde al propietario de la mutación y al futuro escritor Organizations; hasta probarla, no habilitar mutaciones afectadas. Este incremento de lectura no afirma resolver escrituras de Fleet/Invoices.

Keycloak conserva identidad, sesión y APP_ADMIN global; cambiar contexto no modifica el token. La ventana de hasta 330 segundos solo aplica a APP_ADMIN. Memberships y roles locales se leen en la siguiente solicitud conforme a `implement-user-invitations`; retirarlos no fuerza logout ni notificaciones.

### 9. Auditoría proporcional

El contrato SecurityEvent actual solo admite ACCESS_DENIED y POLICY_CHANGED: no fingir que soporta eventos organizacionales. Definir puerto específico de eventos de contexto y futuro puente Audit, reutilizando formato mínimo de actor verificado, instante servidor, eventId/correlación, acción, resultado y organización validada si existe. Acciones: CONTEXT_SELECTED, CONTEXT_SWITCH_REQUESTED, CONTEXT_RESTORED, CONTEXT_DENIED y CONTEXT_INVALIDATED. SWITCH expresa intención declarada; un backend sin sesión no puede certificar cuál fue la organización previa de la UI. No registrar ID ajeno recibido y no validado, tokens, credenciales ni payloads.

Resolver con éxito requiere captura duradera del evento mínimo en colección de eventos pendientes de Organizations; fallo produce 503 y la UI no publica selección. No se necesita transacción con contexto persistido porque no existe. Entrega posterior a Audit idempotente por eventId, fuera de este incremento mientras Audit no exista; no afirmar cobertura integral. Denegación se mantiene aunque falle el registro; aplicar límites/deduplicación como en autorización. Reintentos de resolución pueden generar varios eventos de solicitudes distintas, no varias mutaciones de negocio.

CONTEXT_INVALIDATED se registra cuando el backend observa pérdida de validez de una restauración/validación, sin afirmar momento exacto de revocación. ASSOCIATION_REVOKED pertenece al futuro escritor autorizado de asociaciones y debe capturarse con su cambio atómico; no se infiere de una lectura. Limpieza puramente local no genera evento confiable de servidor. Retención/entrega operativa de Audit queda pendiente; no exponer consulta de auditoría ni habilitar audit:read.

### 10. Verificación y dependencias

La spec contiene los 22 escenarios solicitados y casos adicionales de errores, accesibilidad, contratos y concurrencia. Unitarias: política estructural, transformación de scopes, casos de uso y transición frontend con reloj/solicitudes controlados. Integración: repositorios reales con índices, revisiones, estados y datos aislados, contrato OrganizationAccessReader y captura durable. API: JWT real de prueba, Zod, envelopes y OpenAPI, no exposición horizontal y regresión de /me/health/docs. Frontend: Testing Library y Playwright con Keycloak/API/MongoDB reales para login, selección, cambio, recarga, logout y dos pestañas.

Pruebas de recursos Fleet/Invoices y confirmación concurrente usan dobles para el contrato hasta que existan proveedores reales; se registran como dependientes y no como aceptación completa. Reutilizar scripts check/build/test:integration/test:http/openapi:lint/test:e2e; no ejecutar suites de implementación para validar documentos en esta etapa.

La entrega de lector y selector aporta evidencia a autorización 6.1–6.2, pero no modifica sus casillas automáticamente. Audit 3.5/6.6, recursos 6.3/6.5, confirmación 6.4 y aceptación integral 7.2 conservan dependencias. Evitar dependencia circular de esperar «autorización 100%»: basta su núcleo existente, que necesita precisamente este proveedor.

## Risks / Trade-offs

- [Datos iniciales no disponibles] → Fixtures aislados para aceptación técnica; provisión real autorizada pendiente, nunca autoasociar desde JWT.
- [Coste de enumerar destinos y resolver grants] → Lectura por lotes con índices y política consistente dentro de la solicitud; sin caché positiva entre solicitudes ni paginación que confunda una página con un único destino.
- [Preferencia manipulada o vieja] → Revalidar tras recarga; no mostrar datos anteriores mientras se resuelve.
- [Respuestas tardías y cambios simultáneos] → Captura de scope, abort y comprobación de generación; pestañas independientes.
- [Revocación concurrente] → Revalidación por operación; mutaciones futuras bloqueadas hasta garantía real de confirmación.
- [Audit aún ausente] → Captura mínima duradera, entrega/retención integral explícitamente pendientes.
- [Solapamiento documental] → organization-context es ciclo de interacción; organizations conserva propiedad e invariantes y identity-access autorización. Reconciliar al sincronizar, sin duplicar funcionalidades.

## Migration Plan

Tras aprobación, crear modelos/índices y pruebas, conectar lector y resolución con política existente, exponer API/documentación y después UI. No hay datos de Organizations actuales que migrar según inventario; detectar conflictos de índices/contrato antes de habilitar lector. No sobrescribir política inicial ni asignar roles/asociaciones de forma implícita.

Habilitación funcional requiere datos autorizados y aceptación real. Rollback: retirar rutas de selección y desconectar lector a indisponibilidad segura, conservar datos y auditoría, mantener autenticación/servicios técnicos. No degradar a autorización permisiva ni borrar volúmenes. Despliegue y sincronización OpenSpec requieren su flujo separado.

## Open Questions

- Texto final y destino específico de cada dashboard cuando se implementen módulos; mientras tanto `/session` es el destino definido.
- Volumen esperado de asociaciones para evaluar después optimización/paginación con conteo total autorizado; el contrato actual devuelve el conjunto completo.
- Retención y destino operativo del historial cuando se entregue Audit; no bloquea definir captura mínima, pero sí declarar auditoría integral.
