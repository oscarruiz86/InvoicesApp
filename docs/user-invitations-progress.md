# Implementación de invitaciones

## Reconciliación de contratos

`implement-user-invitations` gobierna la transición. Las casillas de los cambios anteriores se conservan y no constituyen evidencia de aceptación del nuevo flujo.

| Contrato | Comportamiento que lo sustituye |
| --- | --- |
| implement-authentication / identity-access | Registro y perfil propios en Keycloak; retorno OIDC a invitación; lectura actual verificada para aceptar. `/auth/me` sigue siendo informativo. |
| implement-authorization / identity-access | APP_ADMIN global verificado; roles locales de memberships aceptadas/LEGACY activas. La retirada local afecta la siguiente petición. Delegación DRIVER mediante gestión autorizada de conductores, sin cambiar grants. |
| implement-organization-context | Descubrimiento y resolución requieren membership y asignación activas; el JWT no aporta roles locales. |
| implement-company-management | Invitación sustituye alta por subject; revisión de membership para cambios, mínimo un rol y protección concurrente del último administrador. |
| design-application-ui / application-ui-design | Invitaciones, Usuarios vinculados y Mi perfil; aceptación sin contexto; perfil ajeno de solo lectura. |

Esta reconciliación documental no activa el flujo ni demuestra su implementación. Los escritores, lectores y pantallas actuales deben sustituirse coordinadamente antes de usar los contratos nuevos.

## Activación coordinada y reversión

La activación requiere una versión de backend y frontend compatible con invitaciones y memberships. Antes del cambio, detener las escrituras de la aplicación, tomar y verificar un respaldo de MongoDB y ejecutar `npm --prefix backend run memberships:migrate` en modo de inventario. Resolver todos los incompatibles antes de continuar. Después ejecutar `npm --prefix backend run memberships:migrate -- --apply` una sola vez; el comando conserva IDs, roles y estados existentes, no fabrica aceptación y no borra asociaciones. Repetir la migración es seguro. No ejecutar `authorization:init` como parte de la transición ni resembrar permisos.

Desplegar juntos el lector de roles locales, los endpoints de invitación/memberships y la UI nueva. El endpoint legacy de alta por subject y su revocación responden `410 INVITATION_FLOW_REQUIRED`; no hay fallback que cree una asociación. Validar la aceptación con invitación y correo verificado, el listado de memberships, el perfil limitado a cuatro campos y que las colecciones/eventos anteriores siguen presentes. La prueba `backend/tests/unit/retired-company-association.test.ts` cubre ambas rutas legacy; las pruebas de migración cubren repetición y conservación de identidades/estados.

## REST: estados y errores

Todas las respuestas protegidas de invitaciones y memberships usan `Cache-Control: no-store`. Los DTOs rechazan propiedades desconocidas y los errores no incluyen secretos, tokens, identidades consultadas ni detalles de persistencia. Invitaciones: 400 para DTO/roles inválidos; 401 para sesión ausente; 403 para permisos, correo no coincidente o delegación no permitida; 404 con respuesta neutra cuando el recurso no está disponible; 409 para duplicado, versión o conflicto de último administrador; 410 para token vencido; 503 para perfil, almacenamiento o persistencia de la solicitud de notificación. La respuesta de creación confirma que la invitación quedó persistida y encolada (`deliveryStatus=UNKNOWN`); no confirma aceptación SMTP.

Memberships: 400 para solicitud/roles inválidos o rol mínimo, 401 para sesión ausente, 403 para autorización, 404 para pertenencia no disponible, 409 para revisión o último administrador y 503 para perfil/proveedor/almacenamiento no disponible. Perfil inactivo no se devuelve. `POST /api/companies/{id}/administrators` y `POST /api/companies/{id}/administrators/{associationId}/revoke` están retirados y contestan 410 `INVITATION_FLOW_REQUIRED` a sesiones autenticadas.

## Entrega asíncrona de invitaciones

En desarrollo, las invitaciones se persisten en la outbox MongoDB y las procesa el servicio `notification-worker`. El SMTP está deshabilitado por defecto; para encolar invitaciones se requiere montar la clave AES configurada por `NOTIFICATION_PAYLOAD_KEY_FILE`. No se escriben enlaces ni tokens en logs. Sigue [notifications.md](notifications.md) para preparar secretos y habilitar SMTP.

La respuesta de creación confirma que la invitación y su trabajo quedaron guardados (`deliveryStatus=UNKNOWN`); no confirma que SMTP haya aceptado el correo. Al finalizar, el worker proyecta el estado a `LOGGED` o `FAILED` sin reenviar si solo falla esa actualización.

## Revisión visual y accesible

Ejecutar `npm --prefix frontend run test:e2e -- tests/e2e/user-invitations-responsive.spec.ts` después de instalar Chromium de Playwright. El escenario de Usuarios vinculados revisa 360 y 1280 px, ausencia de desbordamiento horizontal, primer foco por teclado, texto de confirmación y mensajes accesibles; la prueba unitaria comprueba que se descarten respuestas obsoletas al cambiar el contexto. Revisar personalmente los cuatro campos del perfil ajeno; no aparecen controles de edición de datos personales.

## Evidencia de implementación

Los contratos de invitación/aceptación se cubren en `backend/tests/unit/invitations-application.test.ts`, `backend/tests/unit/invitations-presentation.test.ts` y `frontend/tests/unit/invitation-acceptance-page.test.tsx`. Perfil compartido, rol mínimo y aislamiento de contexto se cubren en `backend/tests/unit/memberships-application.test.ts`, `frontend/tests/unit/membership-page.test.tsx` y `frontend/tests/unit/invitation-api.test.ts`; retirada legacy está en `backend/tests/unit/retired-company-association.test.ts`. `frontend/tests/e2e/user-invitations-responsive.spec.ts` verifica 360/1280 px. `openspec validate implement-user-invitations --strict` pasa.

Verificación ejecutada: frontend `npm run check` (89 pruebas, arquitectura válida) y `npm run build` pasan; el e2e responsive pasa (2 pruebas). Backend `npm run check` (312 pruebas, arquitectura válida), `npm run build` y `npm run openapi:lint` pasan. Lint informa avisos no bloqueantes de hooks/fixtures; el build frontend informa que el chunk principal supera 500 kB. Se levantó una réplica Mongo temporal aislada en puerto 27018: las suites de autorización, aceptación, migración, administración de memberships, Mongo y contexto pasaron (6 archivos, 13 pruebas). La comprobación del directorio con el Keycloak local creó y eliminó un realm temporal, pero no pudo provisionar su usuario de prueba; se confirmó que no quedaron realms temporales. Docker deniega conexión al engine. La ejecución restante de `company-management.test.ts` aún reporta dos aserciones fallidas fuera de los escenarios cubiertos por la regresión de invitaciones/memberships; no se ocultan ni se atribuyen a dicha regresión. No se declara terminada la prueba integral de extremo a extremo con Keycloak.

La reconciliación mantiene anotada en `design.md` la comprobación de APP_ADMIN en Keycloak como lectura actual no serializada junto al commit Mongo. No se toma esa lectura puntual como garantía de coordinación ante una retirada concurrente; queda como límite explícito para la revisión antes de archivo.

Si la activación falla, detener nuevas mutaciones y conservar invitaciones, memberships, asociaciones, políticas y auditoría para diagnóstico. Revertir solo a una versión compatible con el modelo de roles locales y memberships; mantener deshabilitadas las rutas legacy, que no deben reabrirse como bypass. No borrar datos, no revertir la política a grants anteriores, no resembrar permisos y no ejecutar `down -v`. La reversión no restaura automáticamente accesos ya revocados ni cancela invitaciones; reconciliar cada caso antes de reanudar escrituras. No se incluye despliegue remoto en este cambio.

La reconciliación de contratos conserva el modelo acordado y no modifica casillas de cambios históricos. La validación OpenSpec y las pruebas de producto de esta implementación se registran en Evidencia de implementación.

## Recuperación después de actualizar contraseña en Keycloak — 2026-11-15

Se añadió “Mis invitaciones” para recuperar el flujo cuando Keycloak devuelve al usuario a Invoices App sin el token original en la URL. `GET /api/invitations/received` usa el correo verificado leído de Keycloak; el usuario ve su historial, organización, estado y roles sin exponer el correo ni ningún token en el DTO. Las acciones autenticadas de aceptar/rechazar usan ID y versión, y solo se habilitan para pendientes vigentes. La aceptación sigue exigiendo correo verificado y perfil completo; la transacción vuelve a validar remitente, organización y roles. No se guarda el token en sessionStorage ni se implementa notificación o cierre forzado de sesión.

La navegación autenticada muestra “Mis invitaciones”, separada de “Gestionar invitaciones”. Los enlaces de gestión solo aparecen con contexto y permisos de administrador; la pantalla de selección vacía incluye un botón a la bandeja. La aceptación desde enlace solo ofrece aceptar/rechazar cuando el correo normalizado de la sesión coincide con el destinatario; sin sesión o con otra cuenta ofrece iniciar sesión/crear cuenta. El callback de autenticación vuelve a Mis invitaciones. Tras aceptar desde enlace o bandeja, se resuelve y selecciona el contexto de la organización invitada; si no se puede activar, se ofrece el selector manual. Esta actualización no ejecutó pruebas automatizadas.

Verificación incremental ejecutada: backend TypeScript y suite unitaria (25 archivos, 314 pruebas), frontend TypeScript y suite completa (14 archivos, 96 pruebas), más suites focalizadas posteriores de navegación, recuperación y transporte autenticado (30 pruebas en 3 archivos), arquitectura frontend, lint OpenAPI y `openspec validate implement-user-invitations --strict` pasan. La prueba de integración contra MongoDB/Keycloak y la revisión de navegador real no se ejecutaron en este cambio.

## Decisión pendiente de consistencia

La aceptación debe revalidar la autoridad actual del remitente. Para COMPANY_ADMIN y THIRD_PARTY_ADMIN se puede coordinar esa evidencia y la aceptación dentro de MongoDB. APP_ADMIN permanece en Keycloak: una consulta actual dentro del intento no serializa una retirada posterior del rol con el commit MongoDB. Falta precisar si se acepta esa comprobación puntual o si se exige coordinación adicional con cambios del proveedor. La segunda opción amplía el diseño; no se implementa silenciosamente ni se sustituye la revalidación por el JWT antiguo del remitente.


## Continuación del flujo de registro — 2026-11-15

La página de aceptación conserva la invitación al escoger «Ya tengo cuenta» o «Crear mi cuenta», soporta cambio de cuenta y requiere una aceptación explícita después de autenticarse. La continuidad del navegador expira en un máximo de 60 minutos y nunca después de la invitación; un reintento de red la conserva y un error terminal la limpia. Los errores de correo distinto, no verificado y perfil incompleto llegan diferenciados hasta la interfaz.

El realm de Keycloak declara el límite específico de verificación de correo en 3600 segundos. Se probó la línea exacta de kcadm del inicializador en un realm temporal sin el atributo; la lectura directa por Admin REST devolvió 3600 y conservó el resto de los atributos. En el realm local existente, Admin REST confirmó verifyEmail=true, el atributo actionTokenGeneratedByUserLifespan.verify-email=3600 y 15 atributos; el valor siguió presente después de reiniciar Keycloak. Un registro OIDC real en un realm temporal generó el correo de verificación hacia un SMTP sink limitado a 127.0.0.1; se decodificó el token y se comprobó exp - iat = 3600 segundos. No se envió correo externo. Se eliminaron los realms temporales y se cerró el receptor local. La tarea 8.4 queda validada. La aceptación de la invitación no verifica el correo por sí sola.

Verificación incremental ejecutada: TypeScript backend y frontend, lint de OpenAPI, docker compose config --quiet y openspec validate implement-user-invitations --strict pasan. El formulario OIDC de Keycloak respondió y mostró correo, nombres y los dos atributos documentales. La prueba adicional de 8.4 completó un registro temporal, capturó el correo de verificación en el SMTP sink local y comprobó la expiración de 3600 segundos; no abrió el enlace ni aceptó una invitación. Las tareas 3.4, 7.2 y 8.5 fueron probadas manualmente por el usuario; 8.4 se valida con la evidencia anterior.

## Validaciones reportadas por el usuario — 2026-11-15

Por confirmación del usuario, las tareas 3.4 (entrega por log), 7.2 (integración con Keycloak/MongoDB) y 8.5 (recorrido y revisión responsive) fueron probadas manualmente y se marcaron completas en `openspec/changes/implement-user-invitations/tasks.md`. Esta nota registra el origen de la validación; no atribuye una nueva ejecución a Codex.
