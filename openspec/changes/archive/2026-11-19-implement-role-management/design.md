# Design

## Context

Ver `proposal.md`. Identity ya dispone de `AuthorizationPolicy`, catálogo de permisos, `grantCeiling`, lectura de política y reemplazo compare-and-swap con evento pendiente. La inicialización guarda el techo completo, `updateRolePermissions` exige `roles:manage` y el repositorio rechaza grants fuera del techo. No existe endpoint administrativo de lectura/escritura ni una UI; `/roles` sigue siendo un marcador que acepta cualquier contexto activo.

La política local no es un reflejo de roles Keycloak: APP_ADMIN proviene de la identidad firmada y los demás roles se resuelven mediante asociaciones locales. Las mutaciones funcionales existentes confirman la versión de política dentro de sus transacciones, por lo que un cambio de roles debe conservar esa garantía.

## Goals / Non-Goals

**Goals:** ofrecer una matriz administrativa global con lectura consistente, actualización versionada, continuidad de administración, auditoría segura e invalidación observable de permisos.

**Non-Goals:** crear roles custom, administrar realm/client roles de Keycloak, cambiar asociaciones o memberships, editar perfiles, generar un motor paralelo de autorización, permitir delegación local de la política o prometer entrega/retención integral de Audit.

## Decisions

### 1. Una sola política local y un catálogo cerrado

Se reutilizarán `AuthorizationPolicy`, `Grant`, `Permission` y `grantCeiling` existentes. La API devolverá el catálogo de roles, permisos y grants vigentes, pero el servidor seguirá siendo la única autoridad de combinaciones válidas. La escritura reemplaza la matriz completa para una versión conocida; no habrá operaciones incrementales de añadir/quitar grant, que complicarían conflictos y permitirían que dos pantallas compongan cambios no revisados.

El catálogo incluirá solo APP_ADMIN, COMPANY_ADMIN, THIRD_PARTY_ADMIN y DRIVER. `grantCeiling` permanece compilado: ampliar el catálogo o sus combinaciones requiere un cambio de producto y código, no una edición administrativa. Se descarta almacenar una definición editable de permisos porque introduciría elevación de privilegios fuera de la revisión del código.

### 2. Continuidad obligatoria de lectura y administración de roles

La validación de una política candidata añadirá invariantes sobre `validGrants`: debe contener los grants permitidos `APP_ADMIN / roles:read / global` y `APP_ADMIN / roles:manage / global`. La lectura de la matriz exige el primero y la escritura el segundo; ambos derivan del rol global APP_ADMIN firmado. Así, un actor no puede confirmar una política que retire su capacidad de revisar o administrar la matriz, ni dejar a todos los APP_ADMIN sin esas facultades. Esta continuidad protege el acceso por rol, no garantiza que exista un usuario APP_ADMIN activo en Keycloak.

No se exige una cantidad mínima de usuarios APP_ADMIN: esa información pertenece a Keycloak y no se administrará ni consultará como directorio en este cambio. La garantía se limita a preservar la capacidad del rol global, no a asegurar que exista una persona configurada en Keycloak.

### 3. Casos de uso y contrato REST

Application expondrá `ReadRolePolicy` y `ReplaceRolePolicy` mediante puertos de lectura/escritura de política. Presentation validará cuerpos cerrados con `expectedVersion` y grants completos, y traducirá `PolicyConflict`, petición inválida, autorización e indisponibilidad a los envelopes existentes. Los handlers solo autentican, leen el scope y llaman al caso de uso.

Se publicarán `GET /api/roles` y `PUT /api/roles`, ambos Bearer, JSON y `Cache-Control: no-store`. Requieren `scope=global` explícito y rechazan `self`, `organization`, IDs de empresa/tercero, parámetros duplicados y propiedades ajenas. GET exige `roles:read`; PUT exige `roles:manage`. La respuesta devuelve `{ policy: { version, grants }, catalog: { roles, permissions, grantCeiling } }`; PUT devuelve el mismo contrato con la versión confirmada. Se descarta reutilizar `/api/auth/permissions`, porque representa los permisos efectivos de una sesión y no debe revelar ni mutar la matriz completa.

### 4. Consistencia, auditoría e invalidación

`replace` conserva su actualización atómica de documento, versión y evento `POLICY_CHANGED`; la nueva invariante se valida antes de llegar al repositorio y se repite allí para proteger usos futuros. La respuesta de éxito se emite solo tras la actualización confirmada. La cola de eventos llena sigue fallando cerrada hasta que Audit implemente entrega/retención, pero se traducirá a un error distinguible de indisponibilidad (`503 POLICY_AUDIT_CAPACITY`), no a un conflicto de versión. La UI mostrará que no se aplicó el cambio y permitirá reintentar únicamente después de recargar la política.

Después de PUT, el frontend invalida el snapshot de autorización y obtiene uno nuevo para GLOBAL antes de mantener acciones habilitadas. Todas las demás peticiones continúan consultando política actual y las escrituras de propietarios ya coordinan la versión dentro de transacción. Una operación que confirme después de la sustitución se reevalúa con la nueva versión o falla; nunca usa el snapshot del navegador como receipt.

### 5. Frontend y alcance global

Se añadirá `modules/role-management` con Domain puro para DTOs de política, Application para leer/reemplazar, Infrastructure para el adaptador HTTP protegido y Presentation para matriz/confirmación. `ProtectedHttp` tendrá un método limitado a `/roles`; no acepta destinos arbitrarios y notificará también sus `403` al mecanismo central de permisos. La ruta `/roles` reemplaza el marker y se protege con `roles:read` y el contexto GLOBAL. Guardar requiere `roles:manage`.

La pantalla muestra por rol los grants seleccionados únicamente desde el catálogo retornado por el servidor. El editor nunca permite alterar nombres de rol, permisos ni scopes. Para evitar presentar un resultado incierto, conserva la matriz segura frente a carga/error, muestra confirmación antes de guardar y ante 409 ofrece recargar la versión vigente; no intenta fusionar ni reenviar automáticamente.

## Risks / Trade-offs

- Política válida pero ningún APP_ADMIN real en Keycloak → se preserva la capacidad del rol, no un directorio externo; documentar procedimiento de recuperación de operador fuera de la API.
- Cola de auditoría pendiente llena → el repositorio ya falla cerrado; mostrar conflicto/indisponibilidad explicable y no crear un bypass.
- Cambio de política visible en pestañas distintas → refresco local inmediato, TTL existente y reevaluación backend limitan la ventana; no se añade WebSocket ni invalidación push.
- `implement-authorization` e `implement-organization-context` siguen activos → depender de sus contratos/código actual, sin marcar sus tareas ajenas como completadas.
- Reemplazo completo puede descartar ediciones paralelas → versión esperada, 409 y recarga explícita, preferidos frente a una mezcla implícita de permisos.

## Migration Plan

1. Inicializar la política existente solo con el comando técnico actual; no resembrar ni reemplazar políticas en despliegues.
2. Añadir las invariantes de continuidad y pruebas de lectura/reemplazo contra una base `_test`; comprobar que las políticas existentes satisfacen ambos grants obligatorios antes de habilitar PUT.
3. Publicar API, OpenAPI y UI después de validar autorización y conflictos. La navegación se habilita únicamente desde GLOBAL con snapshot confirmado.
4. Reversión: retirar rutas y UI nuevas sin modificar el documento de política ni sus eventos; la evaluación existente continúa usando la última política confirmada.
