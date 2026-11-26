# Revisión del contrato HTTP actual

Revisión estructural de `openapi/openapi.json` frente a los Route Handlers de `src/app/api`, su composición de autenticación y las respuestas compartidas. Este informe separa la cobertura de transporte de una comparación campo por campo con cada esquema Zod/DTO.

## Hallazgos confirmados

- OpenAPI declara `3.1.0`, 73 operaciones, todas con `operationId`, resumen, respuestas y cuerpo JSON Schema para cada operación mutante que acepta cuerpo.
- Los 57 archivos Route Handler exportan 73 métodos; la comparación de método y ruta arroja 73 correspondencias, cero métodos implementados sin operación y cero operaciones documentadas sin handler.
- Hay 69 operaciones con Bearer JWT y cuatro sin seguridad: `GET /api/health`, `GET /api/openapi`, `GET /api/docs` y `POST /api/invitations/preview`. El cuarto caso es una operación de negocio pública por token de invitación, no un endpoint técnico.
- Redocly lint valida la estructura actual OpenAPI 3.1.
- El backend tiene validadores Zod en las capas de presentación, pero no genera el OpenAPI desde ellos ni se encontró un control que compare automáticamente sus propiedades con el JSON publicado.

## Brechas de respuesta observadas

- Ocho respuestas exitosas carecen de `content`/schema aunque las rutas devuelven JSON: `GET /api/parameters`, `GET /api/parameters/{key}`, `PATCH /api/parameters/{key}`, `GET /api/parameters/{key}/history`, `GET /api/catalogs/{catalog}`, `POST /api/catalogs/{catalog}`, `PATCH /api/catalogs/{catalog}/{code}` y `POST /api/catalogs/{catalog}/{code}/deactivate`.
- 155 respuestas de error en 32 operaciones carecen de `content`/schema. Los handlers de invitaciones, membresías, facturas QR, parámetros, catálogos y sincronización offline emiten envelopes JSON con `error.code` y normalmente `error.message`; el contrato no detalla esos cuerpos en esas respuestas.
- Los códigos concretos no son uniformes: el manejador común cubre 401/403, configuración 503 e interno 500, mientras que módulos como invitaciones mapean errores de dominio a 400/403/404/409/410/503 directamente. No se debe asumir que un mismo código de error implica idéntica condición funcional.

## Mapeos HTTP revisados

- `shared/presentation/http/errors.ts`: autenticación inválida → 401 `UNAUTHENTICATED` con `WWW-Authenticate: Bearer`; autorización denegada → 403 `FORBIDDEN`; configuración inválida → 503 `CONFIGURATION_ERROR`; error inesperado → 500 `INTERNAL_ERROR`. Los mensajes son neutros.
- Invitaciones: entrada inválida 400; destinatario/permiso no autorizado 403; recurso ausente 404; versión/estado/duplicado 409; invitación expirada 410; indisponibilidad 503. El actor destinatario verifica identidad mediante token y correo validado.
- Membresías: entrada inválida 400; prohibido 403; no encontrado 404; conflicto de revisión 409; servicio no disponible 503. Las búsquedas legacy de usuarios aplican su propio mapeo explícito.
- Parámetros y catálogos: entrada inválida 400; ausente/no inicializado 404; revisión incompatible 409; prohibido 403; almacenamiento/autorización no disponible 503. Sus handlers siempre devuelven JSON, aunque OpenAPI omite los ocho schemas exitosos ya enumerados.
- Terceros, vehículos, conductores y asignaciones: los handlers traducen errores propios a 400/403/404/409/503 con códigos del módulo; terceros también puede incluir `fields` sin valores enviados. Los 401 y errores de configuración/runtime proceden del wrapper común.
- Facturas: validación o QR 400; permiso/ventana de edición/campos QR inmutables 403; recurso 404; duplicidad/idempotencia/versión/elegibilidad 409; imagen excesiva/no soportada 413/415; configuración/servicio 503.
- Sincronización offline: límites de imagen 413; credencial y autorización mantienen sus mapeos propios; conflictos de versión/duplicidad 409 y servicio no disponible 503.

Estos mapeos establecen qué responses deben representarse y qué schemas de error se pueden reutilizar. No hacen semánticamente intercambiables códigos similares de familias distintas.

## Estado verificado del contrato

Se agregaron schemas para las respuestas exitosas de parámetros, historial de parámetros y catálogos a partir del catálogo de parámetros, tipos de aplicación y `CatalogEntry` del dominio. Las 155 respuestas de error que no declaraban body ahora referencian el envelope compartido `ApiError`, según los handlers y el responder HTTP revisados. Se mantuvieron los códigos, descripciones, operaciones y paths existentes. El control estructural confirma cero request/response/error bodies sin schema, y Redocly lint valida el contrato.

Se revisaron los ejemplos existentes: son sintéticos (incluido `example.com` reservado para ejemplos) y no contienen tokens, contraseñas ni credenciales. No se documentan interfaces de worker o administración interna.

El comando `npm run openapi:check` combina Redocly lint y `scripts/check-openapi-routes.mjs`. Este recorre exports `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`, traduce segmentos dinámicos de Next.js y falla ante rutas sin operación, operaciones obsoletas, operaciones incompletas o bodies sin schema. `node scripts/check-openapi-routes.mjs --self-test` verifica la detección de operaciones faltantes/obsoletas y schemas ausentes.

La respuesta de `documentationResponse()` se verificó directamente: referencia sólo `/docs-assets/...` y `/api/openapi`, configura `validatorUrl: null` y `persistAuthorization: false`, y no incluye URLs externas. Una prueba HTTP completa no pudo iniciar en esta sesión porque no existe `backend/.next/standalone/server.js`; no se construyó el backend para generar ese artefacto.

## Estado de la comparación de esquemas

Los cuerpos solicitados tienen schema estructural OpenAPI, pero OpenAPI lint no demuestra equivalencia campo por campo con Zod, transforms, refinements, nullability, DTOs de respuesta o errores específicos. Los schemas de parámetros/catálogos y el envelope ApiError se contrastaron con sus tipos y handlers propietarios; la correspondencia exacta de los demás schemas de request/response debe completarse con sus módulos propietarios en cambios posteriores. No se infieren campos ni respuestas en este informe.

Zod 4.6.7 está instalado y ya incluye `z.toJSONSchema`; no es necesario agregar un conversor para iniciar esa estrategia. El conversor local produjo correctamente los límites y `additionalProperties: false` de un objeto estricto, pero el esquema de entrada de `z.coerce.number()` queda como `number` (no describe por sí solo la serialización del parámetro query) y una condición personalizada `.refine()` no se representa como una restricción JSON Schema. El diseño adopta conversión para schemas representables, mapeo explícito en la frontera HTTP para coerciones/refinements y modos input/output apropiados; schemas no representables deben fallar explícitamente, no convertirse silenciosamente a `{}`. OpenAPI 3.1 usa el dialecto de JSON Schema Draft 2020-12.

## Seguridad y despliegue

`/api/docs` y `/api/openapi` pasan por `technicalEndpoint`, no por autenticación; por tanto son públicos con la configuración actual. El usuario confirmó mantenerlos públicos también en producción. El Compose productivo encontrado corresponde a un worker de notificaciones y no publica el backend REST; no se debe inferir de él una protección o exposición adicional. `POST /api/invitations/preview` es igualmente público, pero opera sobre una invitación mediante token del cuerpo. El contrato declara todos estos casos sin Bearer.

## Permisos y excepciones autenticadas

Las 69 operaciones con Bearer declaran `x-required-permissions`; 58 contienen uno o más permisos cuyo nombre pertenece al catálogo de `identity/domain/permissions.ts`. Las otras 11 declaran una lista vacía y una explicación de identidad/contexto; las inspecciones de handlers muestran estas excepciones:

| Operaciones | Evidencia actual | Interpretación documentable |
|---|---|---|
| `GET /api/auth/me` | `authenticatedEndpoint` devuelve el perfil autenticado; no invoca autorización de negocio. | Identidad propia; no requiere permiso de negocio. |
| `GET /api/auth/permissions` | Handler autenticado; devuelve los permisos efectivos del actor y valida el scope de consulta. | Consulta propia autenticada; no delega autoridad. El acceso global/organizacional se valida en la consulta. |
| `GET /api/organization-contexts`, `POST /api/organization-contexts/resolve` | Ambos usan handlers autenticados; la aplicación resuelve contextos y permisos efectivos, con auditoría para la selección. | Operaciones de contexto autenticadas, sujetas a validación del scope y asociaciones. |
| `POST /api/companies/{id}/administrators`, `POST /api/companies/{id}/administrators/{associationId}/revoke` | Las rutas apuntan a respuestas `retiredCompanyAssociationResponse`; no ejecutan asociación/revocación legacy. | Excepción autenticada de rutas legacy retiradas; el contrato debe describir su respuesta de retiro, no un permiso administrativo operativo. |
| `GET /api/invitations/received`, `POST /api/invitations/received/{id}/accept`, `POST /api/invitations/received/{id}/reject` | Handler autenticado; la aplicación limita los registros al correo destinatario verificado y revalida invitación, identidad y estado. | Autorización por identidad destinataria y recurso, no por permiso administrativo general. |
| `POST /api/invitations/accept`, `POST /api/invitations/reject` | Handler autenticado; invitación tokenizada exige que identidad y correo verificado correspondan al destinatario. | Autorización por identidad verificada y credencial de invitación; no declarar permiso no aplicado. |

Las operaciones con permisos no vacíos publican nombres presentes en el catálogo. Su ámbito y restricciones deben conservarse tal como aparecen en `x-authorization-scope` y contrastarse con los servicios propietarios cuando cambien; el catálogo de roles/grants no permite inferir de forma segura un rol único por operación.
