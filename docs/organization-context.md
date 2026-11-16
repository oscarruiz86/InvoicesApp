# Contexto organizacional

Implementación autorizada mediante `openspec-apply-change implement-organization-context`. Backend y frontend siguen independientes. La selección no concede permisos: Identity valida grants y Organizations aporta hechos MongoDB por su contrato público.

## Datos y provisión

Organizations posee `organizations` (id, type, name, active, revision, updatedAt), `organization_associations` (id, subject, organizationId, capability, active, revision, updatedAt) y `company_third_party_relations` (companyId, thirdPartyId, active, revision, updatedAt). IDs opacos de hasta 128 caracteres. COMPANY admite COMPANY_ADMIN; THIRD_PARTY admite THIRD_PARTY_ADMIN/DRIVER. APP_ADMIN no es capacidad local. Índices únicos de ID, asociación `(subject, organizationId, capability)` y pareja empresa-tercero.

No hay CRUD ni provisión automática desde JWT. Sin asociaciones, el listado devuelve vacío. La política debe inicializarse por el procedimiento existente `authorization:init`, sin sobrescribir versiones. Los datos funcionales requieren un escritor administrativo autorizado futuro. Las pruebas crean únicamente bases aleatorias propias terminadas en `_test`; nunca usar fixtures como fallback de runtime. Los escritores futuros deben aumentar revisión ante cambios, conservar auditoría y validar tipos de referencias. Datos incompatibles se rechazan al leer; una edición directa no es un procedimiento administrativo soportado.

El lector realiza dos lecturas ordenadas de hechos completos y reintenta hasta tres veces si cambian. No cachea decisiones entre solicitudes. Una lectura que no converge produce 503. `contextRevision` es un hash de hechos y revisiones, no una credencial. Los pares empresa-tercero requieren relación activa y asociaciones aplicables; una relación no crea una asociación de usuario.

## API

- `GET /api/organization-contexts`: `{organizations:[{organizationId,organizationType,organizationName,roles}],globalAvailable}`; solo destinos propios activos con grants efectivos. No acepta query.
- `POST /api/organization-contexts/resolve`: `{selection:{kind:"ORGANIZATION",organizationId,organizationType},reason:"INITIAL"|"SWITCH"|"RESTORE"}`; GLOBAL usa `{kind:"GLOBAL"}`. Devuelve contexto resuelto con snapshot `authorization` existente.
- `/api/auth/permissions` conserva su contrato de scope explícito para refresh. No hay GET/PUT/DELETE `/active`: no existe una sesión de contexto en servidor. Clear es local y no hace logout.

Bearer JWT validado y `Cache-Control: no-store`. Los cuerpos son cerrados y nunca aceptan subject/roles/permissions del cliente. 400 INVALID_REQUEST; 401 UNAUTHENTICATED con WWW-Authenticate; 403 FORBIDDEN neutro para destino ajeno/inexistente/inactivo; 503 AUTHORIZATION_UNAVAILABLE o CONFIGURATION_ERROR; 500 INTERNAL_ERROR. Los recursos propietarios conservan 404 RESOURCE_NOT_FOUND para IDs ajenos. Swagger se sirve en `/api/docs`, tag Organization Context; no persiste credenciales al recargar.

## Flujo de interfaz

Después de `/me`, revalidar preferencia de la misma identidad. Sin preferencia: GLOBAL autorizado tiene prioridad; una organización se selecciona automáticamente; varias requieren elección; cero muestra mensaje/reintento/logout. `/session` es el resumen provisional; no se muestran módulos inexistentes. APP_ADMIN necesita además rol operativo y asociación local para seleccionar una organización.

La preferencia sessionStorage solo contiene versión, subject y selección mínima. No almacena nombres, roles, permisos ni tokens. Si el almacenamiento falla, la UI informa modo memoria. Pestañas independientes; BroadcastChannel transmite exclusivamente `CLEAR_SESSION` para limpieza al logout, nunca selección o credenciales.

Cambiar o abrir selector confirma descarte si hay participantes sucios, invalida permisos, cancela solicitudes y limpia estado antes de activar otro contexto. La selección solo se publica cuando contexto y snapshot vigente coinciden en sujeto, scope y revisiones. Red/503 deja reintento sin datos anteriores. AuthorizationStore conserva refresh por foco, renovación y caducidad de 30 segundos; mientras refresca se oculta contenido protegido. Una revocación backend impide operaciones nuevas aunque aún haya una vista vieja. Los roles del token conservan la ventana de hasta 330 segundos documentada por Identity.

Los módulos futuros registran `{dirty,clear}` con `contextStore.register`, liberan el registro al desmontarse y usan `contextStore.capture()` antes de iniciar solicitudes. El resultado entrega scope inmutable, AbortSignal, `isCurrent()` y `release()`. Publicar una respuesta solo si `isCurrent()` sigue siendo verdadero y liberar en finally. No reintentar mutaciones automáticamente en otro contexto; una escritura ya recibida puede finalizar en su ámbito original.

## Auditoría y límites

Éxito requiere captura durable en `organization_context_events` con write concern majority/journal. Se persisten actor verificado, acción, instante, correlación, resultado y organización validada. `CONTEXT_SWITCH_REQUESTED` es intención declarada, no prueba de cuál era el contexto anterior. Denegaciones no contienen IDs ajenos; máximo 100 por minuto/proceso con contadores de supresión. Fallo de registro de denegación nunca autoriza.

`eventId` identifica un evento para entrega idempotente al futuro Audit; captura repetida del mismo ID no duplica documento. `delivered:false` reserva entrega pendiente. No existe todavía entrega/retención integral ni endpoint audit:read. `CONTEXT_INVALIDATED` significa invalidez observada; ASSOCIATION_REVOKED debe capturarse atómicamente por el escritor futuro, no inferirse de una lectura.

Fleet/Invoices deben demostrar filtros reales de pertenencia y `AuthorizedMutation` con revisión y escritura serializadas. Releer contexto no sustituye esa garantía. No se habilitan sus mutaciones ni se declaran completas tareas 13.1–13.2 mediante dobles.

## Verificación

Unitarias y arquitectura: `npm --prefix backend run check`, `npm --prefix frontend run check`. Contrato: `npm --prefix backend run openapi:lint`. MongoDB aislado: definir MONGODB_TEST_URI apuntando a una base `_test` y ejecutar `npm --prefix backend run test:integration`. Aceptación: `node scripts/test-organization-context.mjs` (Docker disponible, MongoDB local por defecto en puerto 27019, navegador Playwright instalado). Usa Keycloak efímero, aplicaciones locales y base aleatoria; no cambia realm ni datos funcionales. Ejecutar secuencialmente con las otras suites que usan Next dev para no compartir `.next/dev` simultáneamente. Evidencia y limitaciones en `organization-context-progress.md`.
