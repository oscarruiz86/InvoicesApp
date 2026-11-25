# Design

## Context

Ver `proposal.md` y los deltas de este cambio. El módulo Organizations ya conserva organizaciones de tipo `THIRD_PARTY`, asociaciones y una colección `company_third_party_relations` con índice único `{ companyId, thirdPartyId }`, pero carece de un agregado con perfil tributario, escritores REST y UI. El flujo de invitaciones ya usa relaciones para delegar administradores de tercero; el selector de contexto, en cambio, representa una empresa o un tercero de forma directa, nunca una pareja empresa-tercero.

La implementación de empresas aporta el patrón de agregado propio, proyección `Organization`, autorización confirmada dentro de transacción, OpenAPI y cliente protegido. Este diseño lo reutiliza sin compartir modelos ni convertir Company en dueño de terceros.

## Goals / Non-Goals

**Goals:** una fuente canónica de perfil de tercero; relaciones many-to-many independientes; autorización y concurrencia verificables; compatibilidad con invitaciones, memberships y contextos existentes.

**Non-Goals:** cambiar el modelo de identidad, crear permisos nuevos, editar perfiles personales de Keycloak, añadir rutas de contexto compuestas, implementar flota/facturas, convertir terceros en dependientes exclusivos de una empresa, ni migrar datos legados inventando NIT, contacto o aceptación de invitación.

## Decisions

### 1. Agregado ThirdParty y proyección Organization

`ThirdParty` será un agregado de Organizations almacenado en `third_parties`. Usará un ObjectId serializado como cadena hexadecimal de 24 caracteres; su proyección en `organizations` reutilizará ese mismo valor como `id`, con `type=THIRD_PARTY`, `name=businessName` y `active` coordinado con el agregado. Los campos seguirán el contrato de Company: `documentType=NIT`, `documentNumber`, `verificationDigit?`, `businessName`, `tradeName?`, `email`, `phone?`, `address?`, `country?`, `department?`, `city?`, `status`, metadatos de servidor y `revision`.

El par `{documentType, documentNumber}` tendrá índice único que incluye registros inactivos. `businessName`, `tradeName` y correo no serán únicos. Las búsquedas normalizadas y los índices de lista se limitarán a los campos realmente expuestos; no se añadirá un catálogo geográfico ni índices especulativos.

Se descarta almacenar el perfil solo en `organizations`: ese modelo actual no conserva datos tributarios, origen ni metadatos requeridos. También se descarta hacer cada relación una copia del tercero, porque rompería la identidad, la unicidad y los contextos de tercero existentes.

El perfil administrativo del agregado ThirdParty describe la organización (NIT, razón social y contacto) y es distinto del perfil personal de una identidad Keycloak. El perfil personal de un `THIRD_PARTY_ADMIN` continúa sujeto al contrato existente: solo ese usuario puede ajustarlo. Ninguna ruta, caso de uso ni interfaz de este cambio modifica datos personales, credenciales o atributos Keycloak de administradores.

### 2. Relación many-to-many y límites de estado

La colección existente `company_third_party_relations` será la fuente de la relación, con una pareja única, `active`, `revision`, `updatedAt` y metadatos de auditoría que sean necesarios. Un tercero puede tener muchas relaciones activas; una empresa puede tener muchos terceros. Crear un tercero desde una empresa crea la primera relación dentro de la misma transacción. Relacionar un tercero existente crea o reactiva solamente la pareja solicitada.

Hay dos transiciones diferenciadas:

| Operación | Ámbito | Efecto |
| --- | --- | --- |
| Estado del tercero | APP_ADMIN global | Cambia la disponibilidad global del perfil y de su organización; no borra relaciones ni membresías. |
| Estado de una relación | APP_ADMIN global o COMPANY_ADMIN de la empresa | Cambia solo esa pareja; bloquea operaciones desde esa empresa, sin afectar otras relaciones ni el perfil. |

La separación evita que un COMPANY_ADMIN inhabilite un tercero compartido para otras empresas. Un `THIRD_PARTY_ADMIN` puede actualizar el perfil administrativo del tercero en su propio ámbito; un `COMPANY_ADMIN` puede actualizar ese perfil mientras conserve una relación activa y los permisos aprobados. Esta última autorización comparte perfil canónico entre empresas y debe aparecer en la UI/auditoría como efecto transversal; se conserva porque el techo de grants actual ya concede `third-parties:update` al COMPANY_ADMIN. Ninguna de esas facultades permite editar el perfil personal Keycloak de un `THIRD_PARTY_ADMIN`.

### 3. Permisos y scopes existentes

No se añadirá un permiso nuevo. Se ajustará el techo de grants para que APP_ADMIN pueda ejercer los cuatro permisos ya declarados de `third-parties:*` en scope global; COMPANY_ADMIN conserva create/read/update en scope de empresa y su permiso `third-parties:deactivate` se interpreta exclusivamente para la transición de relación de su empresa. THIRD_PARTY_ADMIN conserva read/update en scope de tercero. DRIVER no recibe administración de terceros.

Las rutas recibirán `scope=global` o `scope=organization` con `companyId` o `thirdPartyId` según la operación. APP_ADMIN debe operar en GLOBAL para mutar el estado global; no hereda ese poder en un contexto local. Antes de devolver un 404 neutro se valida actor, scope y permiso. Filtros, conteos y páginas se ejecutan sobre el conjunto autorizado, nunca sobre un listado global filtrado en memoria.

### 4. Casos de uso, repositorio y confirmación

Domain contendrá el perfil validado y las reglas puras de transición. Application expondrá puertos estrechos y casos `CreateThirdParty`, `ListThirdParties`, `GetThirdParty`, `UpdateThirdParty`, `SetThirdPartyStatus`, `CreateOrReactivateRelationship` y `SetRelationshipStatus`. Infrastructure implementará el repositorio MongoDB y los mapeos. Presentation validará DTOs Zod, traducirá errores y mantendrá Route Handlers delgados. Bootstrap compondrá los adaptadores existentes de identidad, Organizations y auditoría.

El repositorio ejecutará escrituras con sesión de MongoDB y transacción. Dentro de ella releerá política, evidencia organizacional, tercero, organización y relación; participará en la confirmación de política/evidencia existente mediante un cambio técnico que colisione con revocaciones concurrentes; aplicará CAS por `revision`; escribirá agregado/proyección/relación y evento. Solo después de commit devolverá éxito. Los reintentos por conflictos volverán a evaluar todos los hechos y serán acotados.

El patrón descarta una sincronización eventual entre `third_parties` y `organizations`: una desalineación permitiría acceso o invitaciones con datos obsoletos.

### 5. Contextos, invitaciones y memberships

Un contexto directo de tercero sigue basándose en organización activa, asociación local activa y permisos vigentes. La relación con una empresa solo es requisito para operaciones que llevan ambos IDs: alta y mantenimiento desde empresa, delegación de COMPANY_ADMIN a THIRD_PARTY_ADMIN, invitaciones y memberships vinculadas a la empresa. Desactivar una relación no invalida una asociación ni un contexto directo de tercero; desactivar el tercero sí lo invalida. Reactivar cualquiera de los recursos no revive asociaciones suspendidas, invitaciones terminales ni roles retirados.

Los casos de invitación y memberships reutilizarán sus puertos para releer tercero y relación dentro de la misma confirmación. El selector modal de terceros reemplazará el lookup ad hoc actual por el adaptador de consulta de terceros, siempre limitado a la empresa solicitante. Así se evita que un lector de invitaciones se convierta en otro propietario de terceros.

### 6. REST, OpenAPI y frontend

Las rutas previstas son `/api/third-parties` para lista/alta, `/api/third-parties/{id}` para detalle/edición, `/api/third-parties/{id}/status` para estado global y `/api/third-parties/{id}/relationships/{companyId}` para crear/reactivar o cambiar la relación. Todas devuelven JSON con `Cache-Control: no-store`, requieren Bearer y documentan el scope. El contrato especificará validaciones, versiones y códigos `INVALID_REQUEST`, `RESOURCE_NOT_FOUND`, `THIRD_PARTY_DOCUMENT_CONFLICT`, `THIRD_PARTY_VERSION_CONFLICT`, `THIRD_PARTY_INACTIVE`, `RELATIONSHIP_INACTIVE`, `UNAUTHENTICATED`, `FORBIDDEN`, errores de dependencia y `INTERNAL_ERROR`.

El frontend incorporará `modules/third-party-management` con tipos/puertos, adaptador HTTP y una página parametrizada como la de empresas. Se registrarán rutas `/third-parties`, `/third-parties/new`, `/third-parties/:id` y `/third-parties/:id/edit`, navegación condicionada por permiso y guards existentes. La gestión de relaciones será una sección del detalle. Los formularios se descartan al cambiar sesión o contexto; las mutaciones no se reintentan automáticamente con un scope distinto.

## Risks / Trade-offs

- Perfil administrativo compartido editable por varias empresas → conservar la autorización COMPANY_ADMIN ya presente, registrar empresa/actor en cada evento y exigir relación vigente; esta facultad nunca se extiende al perfil personal Keycloak.
- Cambiar grants del APP_ADMIN → incluir pruebas de matriz de permisos para no ampliar grants locales ni de DRIVER.
- La relación actual no conserva todos los metadatos requeridos → migración aditiva compatible que inicialice campos técnicos sin alterar estado ni fabricar relaciones.
- Transacciones requieren replica set → verificarlo antes de escribir; no ofrecer fallback no transaccional.
- Lectores actuales de terceros en invitaciones → sustituirlos gradualmente detrás del puerto, con pruebas de contrato y sin ejecutar consultas globales desde el navegador.
- Cambios activos de autorización/contexto aún tienen tareas pendientes → consumir solo sus contratos y código presente; ejecutar la implementación desde `development` en `openspec/implement-third-party-management` y reconciliar conflictos antes de abrir el pull request.

## Migration Plan

1. Crear índices, esquema y colección de terceros; comprobar replica set y ejecutar pruebas contra una base `_test` aislada.
2. Inventariar organizaciones THIRD_PARTY y relaciones existentes. Migrar únicamente las que tengan un mapeo de perfil acordado; los registros sin NIT/correo quedan operativos para lectores actuales y fuera de la nueva gestión hasta una reconciliación explícita.
3. Habilitar los escritores y rutas después de comprobar transacciones, autorización, OpenAPI e integración con invitaciones. La UI se conecta después de esas verificaciones.
4. Reversión: ocultar rutas y navegación nuevas conservando terceros, proyecciones, relaciones y eventos; no borrar colecciones, historia ni revocaciones.
