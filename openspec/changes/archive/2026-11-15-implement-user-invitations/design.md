# Design

## Context

Ver proposal.md para motivación y specs/user-invitations/spec.md para comportamiento. La revisión del repositorio encontró:
- companies.associate activa una asociación después de consultar el rol COMPANY_ADMIN en Keycloak.
- organization_associations mantiene una fila por subject, organizationId y capability; authorization-policy exige además actor.roles procedente del JWT.
- organization-contexts ya calcula roles efectivos por organización. Esta capacidad se conserva.
- company-page solicita el subject de Keycloak; no hay flujo de invitación.
- La verificación JWT no consulta revocación de sesiones. Notificación por cambio de roles y logout forzado están aplazados.
- Solo foundations está archivado en openspec/specs; contratos funcionales permanecen en cambios abiertos.

## Goals / Non-Goals

**Goals:** incorporar invitaciones sin ampliar la matriz de negocio, entregar enlaces al log para pruebas, separar pertenencia y roles, reutilizar transacciones y proteger la transición del modelo actual.
**Non-Goals:** crear un sistema general de notificaciones, SMTP de la aplicación, edición de permisos, forzar logout, CRUD completo de terceros/conductores o despliegue. El registro y perfil propio son responsabilidad de Keycloak.

## Decisions

### 1. Propiedad y fuente de roles

Organizations posee invitaciones, pertenencias y asignaciones. Identity verifica identidad y expone lectura de perfil por un puerto; no se importan sus modelos privados. El actor autenticado conserva subject y APP_ADMIN global; los roles locales se derivan de evidencia persistida del contexto.
Adaptar matchingGrants, validOrganization, organización disponible y snapshots self/global/organization para no exigir el rol local en realm_access. Mantener restricciones de propietario y recurso. Una cuenta sin asociación puede acceder al recorrido de invitación y perfil, pero no a operaciones organizacionales.
Alternativa descartada: escribir roles globales en Keycloak por cada invitación; mezcla ámbitos y obliga a sincronizar dos fuentes.

La asignación inicial conserva la cadena APP_ADMIN → COMPANY_ADMIN → THIRD_PARTY_ADMIN → DRIVER. Las acciones de invitación/roles reutilizan la autorización de asociación o gestión de conductores aplicable, con comprobación explícita de rol objetivo; no conceden edición de permisos. Conservar los límites incluso cuando un actor combine varios roles.

### 2. Modelo y concurrencia

Invitation: id, organizationId/type, companyId remitente cuando corresponda, recipientEmail normalizado, roles, invitedBy, status, expiresAt, tokenHash, tokenVersion, version, createdAt, resolvedAt, acceptedSubject y deliveryStatus/attemptId. Por defecto propuesto: 72 horas de vigencia configurable. Normalizar espacios y comparación de correo de forma uniforme, sin eliminar puntos ni sufijos plus.
Membership: id, subject, organizationId, status ACTIVE/INACTIVE, origin INVITATION/LEGACY, acceptedInvitationId opcional, acceptedAt opcional y revision. Índice único subject/organizationId.
Conservar organization_associations como asignaciones por rol vinculadas a membership; las lecturas exigen ambas activas. No usar borrado físico. Una pertenencia conserva al menos un rol incluso suspendida.
Índice único parcial de invitaciones PENDING por correo/organización; al crear, resolver expiración de una pendiente vencida en la transacción antes de insertar.
Aceptar, cambiar roles, suspender y reactivar usan transacción, revisiones y coordinación de política/organización existentes. La comprobación del último administrador requiere coordinación por organización para evitar write skew. Una organización recién creada sin administrador admite incorporación; una que ya está operativa no puede perder el último sin reemplazo.
Alternativa descartada: usar invitación aceptada como registro mutable de roles; destruiría la evidencia original.

### 3. Enlace y entrega al log

Generar secreto aleatorio de alta entropía, almacenar solo hash y comparar en servidor. URL pública propuesta: /invitations/accept#token=... sobre origen configurado, nunca derivado de Host. El frontend lee el token del query o fragmento y lo mantiene en la URL mientras la invitación siga pendiente; no lo copia a sessionStorage/localStorage ni lo elimina durante lecturas o recargas. Aceptación, rechazo o invalidez terminal lo eliminan de la URL. La invitación es una credencial de portador: no incluirla en auditoría ni logs HTTP.
Puerto InvitationDelivery con adaptador LogInvitationDelivery; configuración INVITATION_DELIVERY_MODE=log exclusivamente en desarrollo/test. Registrar evento INVITATION_LINK con invitationId, attemptId, expiresAt y URL completa. La UI muestra “Invitación registrada en el log de pruebas”, nunca “correo enviado”.
El log dedicado es la excepción explícita para el enlace solicitado; no registrar contraseñas, tokens OIDC ni documento. El log de auditoría y los logs HTTP no reciben el secreto. No incluir analítica en la página de aceptación.
Confirmar invitación antes de entregar. Entrega síncrona acotada: éxito → LOGGED; fallo → FAILED con invitación pendiente y reenvío permitido. Si cae el proceso antes de registrar resultado, queda UNKNOWN. No simular atomicidad entre MongoDB y stdout. Reenvío rota secreto y renueva vencimiento; una respuesta incierta se resuelve consultando estado y reenviando, no recreando la invitación. No almacenar secreto recuperable para reintentos automáticos.
Alternativa descartada: SMTP/outbox de notificaciones general, fuera de alcance actual. El puerto permitirá otro adaptador en una propuesta futura.

### 4. Registro, verificación y perfil

Activar registro de Keycloak y atributos administrados document_type/document_number; nombres se derivan de firstName/lastName y se presentan como nombre completo. Propuesta inicial de catálogo: CC, CE, TI, RC, PA y PPT, sin país emisor; alcance de uso Colombia. Número almacenado como texto, trim, longitud acotada y caracteres compatibles con el catálogo; no introducir una unicidad global de documento que no ha sido solicitada. Documentar catálogo y límites en configuración y probarlos.
El correo no se edita en el perfil normal. Perfil y recuperación de credenciales pasan por Keycloak; la empresa no recibe permisos administrativos sobre esas identidades.
Aceptar requiere email_verified y correo actual coincidente, obtenidos desde identidad verificada; nunca confiar en correo enviado por el navegador. Una lectura autorizada de perfil actual evita compartir datos obsoletos del token. Proveedor caído devuelve indisponibilidad sin ampliar acceso.
El enlace de invitación NO verifica correo. Sin SMTP, pruebas locales usan cuentas que un operador marca verificadas en el realm de desarrollo después del registro, o fixtures verificadas. Documentar este paso y mantener el backend estricto. Un despliegue real requiere verificación de correo operativa y otro mecanismo de entrega; no está habilitado por este incremento.
Alternativa descartada: nuestra API crea cuenta y contraseña o marca automáticamente el correo verificado al abrir el enlace.

### 5. API y experiencia

Contratos propuestos, sujetos a las convenciones actuales:
- POST/GET /api/invitations; GET /api/invitations/:id para administración aislada.
- GET /api/invitations/received y POST /api/invitations/received/:id/{accept,reject} para recuperar la bandeja del correo Keycloak verificado; el DTO no expone correo, token ni hash.
- POST /api/invitations/:id/cancel y /resend con versión esperada.
- POST /api/invitations/preview, /accept y /reject con secreto en cuerpo y sesión verificada; respuestas no-store.
- GET /api/organization-memberships y /:id/profile; PATCH /:id/roles y /:id/status con revisión.
El listado autorizado de invitaciones está separado del perfil. No revelar existencia de cuentas por correo al invitar. Orden estable, paginación y filtros aplicados después del ámbito y antes del conteo. Errores 400/401/403/404/409/410/503 y códigos de negocio documentados; enlaces inválidos no revelan destinatarios.
Vista “Invitaciones” con estados/historial, “Usuarios vinculados” con perfil/roles, “Mi perfil” enlazado al proveedor. Aceptación explica roles y cuatro datos compartidos y funciona sin organización activa. Usuarios activos van a gestión de roles; inactivos previamente aceptados a reactivación autorizada. Nueva organización exige invitación.
Eliminar entrada de subject del flujo ordinario. El endpoint legado de asociación directa no debe permanecer como bypass; se retira coordinadamente con el frontend.
No implementar cierre de sesión ni notificación de cambio de roles; sí invalidar snapshots de UI y comprobar permisos vigentes en cada petición. Un 403 no equivale a logout.

### 6. Compatibilidad con propuestas abiertas

| Contrato previo | Cambio explícito al implementar este incremento |
|---|---|
| implement-authentication | Registro, perfil documental, retorno a invitación y correo verificado. |
| implement-authorization / identity-access | Fuente local de roles organizacionales; conservar catálogo, techo y restricciones. Documentar asignación DRIVER mediante gestión autorizada del tercero. |
| implement-organization-context | Filtrar por membership activa y roles; mantener cálculo por organización. |
| implement-company-management | Reemplazar asociación directa, consulta de perfiles limitada y protección del último administrador; sustituye la regla previa que permitía cero administradores tras revocación. |
| design-application-ui | Incorporar invitaciones/aceptación/perfil y gestión de roles, reemplazando creación de identidad administrativa en este recorrido. |

Esta propuesta gobierna esos cambios de comportamiento cuando se implemente. No marcar completadas tareas de otros cambios ni reinterpretar las pruebas anteriores como pruebas del flujo nuevo. Antes de sincronizar/archivar, reconciliar los requisitos funcionales de los cambios abiertos para que ninguna especificación conserve la regla sustituida. No modificar foundations para simular que esos contratos ya están archivados.

## Risks / Trade-offs

- Enlace completo en log → modo explícito de pruebas, acceso restringido al log, vencimiento, un solo uso y rotación.
- Log escrito pero respuesta perdida → estado de entrega separado y reenvío; nunca afirmar recepción por usuario.
- Keycloak sin correo saliente → procedimiento local de verificación manual, sin bypass en aplicación.
- Cambios concurrentes o remitente sin autoridad → revalidación transaccional y rechazo de contexto obsoleto.
- Terceros y conductores aún incompletos → usar organizaciones/relaciones existentes y fixtures aisladas; no inventar CRUD de flota ni inferir relación por documento.
- Multirrol limitado por catálogo actual → admitir conjuntos, pero mostrar solo roles compatibles y delegables; no crear roles nuevos para demostrar la interfaz.

## Migration Plan

1. Inventariar en modo read-only asociaciones, roles, organización y cuentas; detectar asociaciones incompatibles, identidades huérfanas y organizaciones operativas sin administrador.
2. Migrar idempotentemente a Membership origin LEGACY conservando estados/IDs y roles; no llenar acceptedAt ficticio. Las incompatibilidades bloquean activación hasta reconciliación explícita.
3. Preparar atributos de Keycloak y lectores locales. Probar matriz completa antes del cambio de fuente; no eliminar roles existentes del proveedor todavía.
4. Activar de forma coordinada escritores, lectores y frontend nuevos; deshabilitar asociación directa. No mantener dos rutas que permitan saltar aceptación.
5. Verificar pruebas y snapshots. Registrar versión de migración y resultados sin datos sensibles.
6. Reversión: desactivar nuevas escrituras, preservar registros e historial y restaurar solo una versión compatible con los nuevos roles locales. No regresar ciegamente al lector que depende de realm_access, ni borrar invitaciones o bases. No ejecutar despliegue como parte de esta propuesta.

## Ajuste de incorporación y continuidad — 2026-11-15

La página pública ofrece «Ya tengo cuenta» y «Crear mi cuenta» tras validar preview. Ambas pasan a Keycloak el loginHint con recipientEmail; el registro usa action=register y precarga el correo de la invitación. No consultar públicamente si existe un correo ni crear cuentas desde nuestra API. El callback conserva la URI exacta /auth/callback y no recibe el token de invitación. El Home URL del cliente OIDC apunta a `/login`, que informa al usuario que debe iniciar sesión tras volver de una acción de Keycloak. Al completar el login, si no tiene contextos organizacionales, la selección redirige a Mis invitaciones, que consulta el correo verificado de la cuenta; nunca aceptar automáticamente.

El token de invitación mantiene 72 horas por defecto y permanece únicamente en la URL original; no hay contador ni marcador de retorno de invitación guardado en el navegador. Una recarga o un nuevo navegador vuelve a consultar al servidor mientras la invitación siga vigente. No aumentar la duración de access tokens (5 min), inactividad SSO (30 min) ni sesión máxima (8 h). Configurar la acción de verificación de correo a 60 min en la configuración declarativa del realm y reaplicarla de forma idempotente al arrancar Compose, incluso con un volumen Keycloak existente; no reemplazar el realm ni desactivar verificación.

Al abrir el enlace original, revalidar preview contra el servidor y exigir aceptación explícita. El token continúa en la URL durante errores reintentables y recargas; no existe una copia de continuidad en almacenamiento del navegador. Al aceptar, rechazar o confirmar que el enlace es inválido, resuelto o vencido, limpiar el token de la URL. Si se regresa de Keycloak sin el token, dirigir a Mis invitaciones; la bandeja recupera el estado desde el backend tras validar correo y sesión.

Cambiar de cuenta inicia una autenticación interactiva con prompt=login desde la página de aceptación. Después del callback de Keycloak, si la URL ya no contiene el token, la interfaz ofrece ir a Mis invitaciones. Mostrar correo de la sesión actual cuando esté disponible. La API de aceptar/rechazar distingue IDENTITY_MISMATCH, EMAIL_UNVERIFIED y PROFILE_INCOMPLETE, sin exponer datos de otras cuentas. No convertir indiscriminadamente todos los 403 de invitación en correo incorrecto.

Después de aceptar ofrecer entrada al inicio para resolver contexto con permisos vigentes. Si falla autenticación, mantener ruta de retorno para reintentar. No aceptar automáticamente tras el registro. Las pruebas locales sin SMTP mantienen la verificación manual documentada; no se implementa proveedor de correo.
