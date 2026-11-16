# Tasks

Las casillas registran avance de implementación y verificación. Este cambio no implementa notificaciones de cambios de roles ni cierre forzado de sesión.

## 1. Contratos y transición

- [x] 1.1 Reconciliar los contratos abiertos identificados en design.md con esta propuesta, sin alterar sus casillas históricas; verificar trazabilidad y ausencia de reglas contradictorias de asociación directa, fuente de roles y último administrador.
- [x] 1.2 Implementar inventario read-only y migración idempotente de Membership LEGACY; probar repetición, preservación de estados/IDs y bloqueo de datos incompatibles en MongoDB de pruebas.
- [x] 1.3 Documentar activación coordinada y reversión compatible; verificar con fixtures que ninguna ruta antigua permite saltar aceptación y que no se borran datos ni se resembran permisos.

## 2. Dominio y persistencia

- [x] 2.1 Modelar invitación, estados, expiración, pertenencia y roles mínimos; probar transiciones inválidas, organización nueva sin administrador y retirada del último rol.
- [x] 2.2 Crear repositorios, índices y revisiones de invitaciones/memberships/roles; comprobar concurrencia real, expiración de pendiente antes de nueva invitación y unicidad por destinatario/organización.
- [x] 2.3 Implementar aceptación transaccional con evidencia actual del remitente y organización; probar carreras aceptar/cancelar, aceptación repetida, fallo de auditoría y ausencia de acceso parcial.
- [x] 2.4 Implementar edición de roles y suspensión/reactivación, con coordinación del último administrador; probar roles no delegables, sustitución atómica, no-op y dos revocaciones simultáneas.
- [x] 2.5 Capturar eventos durables mínimos y documentar estados; verificar que auditoría no contiene enlaces, documentos ni tokens y que la migración no fabrica aceptación.

## 3. Entrega provisional

- [x] 3.1 Implementar puerto de entrega y adaptador log con origen público configurado; probar enlace completo navegable, evento identificable y rechazo de modo log en producción.
- [x] 3.2 Implementar secreto de un uso, hash persistido, vencimiento configurable y rotación al reenviar; probar que el enlace anterior deja de funcionar y que los logs HTTP/auditoría no lo copian.
- [x] 3.3 Registrar LOGGED/FAILED/UNKNOWN sin confundir entrega con aceptación; probar fallos antes/después del log y recuperación por reenvío sin asociaciones ni invitaciones duplicadas.
- [x] 3.4 Documentar comando para consultar el log en host/Compose y recorrido de prueba; verificar manualmente apertura del enlace y mensaje de entrega al log sin afirmar envío de correo.

## 4. Identidad y autorización

- [x] 4.1 Configurar registro, perfil propio, correo no editable y atributos documentales en Keycloak; probar usuario nuevo/existente, validaciones colombianas y ausencia de contraseñas en la aplicación.
- [x] 4.2 Implementar lectura de identidad/perfil verificado por puerto y continuidad OIDC de la invitación; probar correo diferente, no verificado, perfil incompleto, proveedor caído y usuario sin contexto.
- [x] 4.3 Documentar preparación de cuentas verificadas en realm local sin SMTP; verificar que la API mantiene email_verified obligatorio y que abrir invitación no verifica correo.
- [x] 4.4 Ajustar autorización y resolución de contexto para roles locales con APP_ADMIN separado; ejecutar matriz de los cuatro roles, multirrol, A/B, self y recursos propios sin ampliar grants.
- [x] 4.5 Implementar delegación de invitaciones/roles para administradores de empresa, tercero y conductores; probar la cadena completa y rechazo de autoescalamiento o pertenencia ajena.
- [x] 4.6 Verificar retirada de roles con token aún vigente y documentar que no hay logout ni notificación automática; comprobar denegación en la siguiente petición y actualización de snapshots.

## 5. REST y datos compartidos

- [x] 5.1 Implementar endpoints/DTO estrictos de invitaciones, preview, aceptación, rechazo, cancelación y reenvío; probar estados HTTP, revisiones, idempotencia, no-store y ausencia de enumeración de cuentas.
- [x] 5.2 Implementar listado de memberships, perfil compartido y mutaciones de roles/estado; probar ámbito antes de paginación/conteo y exactamente cuatro campos personales.
- [x] 5.3 Retirar el escritor de asociación directa al activar el nuevo flujo y adaptar contratos de empresas; probar que una petición legacy no crea acceso sin aceptación.
- [x] 5.4 Extender OpenAPI y documentación de errores/estados; ejecutar lint de contrato y pruebas HTTP de cuerpos reales y errores sanitizados.

## 6. Interfaz

- [x] 6.1 Crear Invitaciones con filtros, historial y acciones solo para pendientes vigentes; probar vencidas, fallos, reenvío, duplicado y confirmaciones.
- [x] 6.2 Implementar aceptación desde token de URL query/fragment, sin persistirlo en almacenamiento del navegador; probar recarga, error reintentable, terminalización y apertura con sesión de navegador vacía.
- [x] 6.3 Sustituir subject manual por invitación y Usuarios vinculados con gestión de roles; probar mínimo un rol, límites por organización y perfil ajeno no editable.
- [x] 6.4 Enlazar Mi perfil con Keycloak y adaptar contexto/navegación; verificar separación de perfil personal y pertenencia, sin rol operativo como prerrequisito para aceptar.
- [x] 6.5 Actualizar guía/wireframes y pruebas responsive a 360/1280 px; verificar teclado, foco, mensajes accesibles y limpieza de respuestas al cambiar contexto.

## 7. Aceptación integrada

- [x] 7.1 Ejecutar checks de backend/frontend, builds, arquitectura y OpenAPI; registrar resultados y límites sin marcar tareas de otros cambios.
- [x] 7.2 Ejecutar integración con MongoDB y Keycloak aislados: los tres roles desde enlace del log, usuario nuevo/existente, verificación local explícita, aceptación y consulta del perfil.
- [x] 7.3 Ejecutar regresión de aislamiento, último administrador, roles mínimos, migración y tokens antiguos; comprobar que no se introdujeron notificaciones ni cierre forzado de sesión.
- [x] 7.4 Vincular escenarios con evidencias y ejecutar openspec validate implement-user-invitations --strict; revisar reconciliación de contratos antes de archivar.

## Workflow follow-up

- Revisar y aprobar los artefactos antes de iniciar apply.
- Al finalizar la implementación, sincronizar las especificaciones funcionales afectadas sin perder la precedencia documentada y archivar el cambio.

## 8. Ajuste de registro y continuidad — 2026-11-15

- [x] 8.1 Proveer login/registro explícito, cambio de cuenta, correo recipientEmail precargado en Keycloak y aceptación explícita; conservar la URI callback exacta.
- [x] 8.2 Mantener el token de invitación exclusivamente en la URL; verificar consulta desde URL query/fragment, recarga y reapertura en navegador nuevo sin sessionStorage.
- [x] 8.3 Propagar errores diferenciados de identidad por backend, transporte y OpenAPI hasta la pantalla de aceptación.
- [x] 8.4 Persistir y comprobar en Keycloak la vigencia de 60 minutos para el enlace de verificación en realms nuevos y volúmenes existentes; Admin REST devolvió 3600 en el realm existente después del reinicio y el token real de verificación generado en un registro aislado tuvo exp - iat = 3600 segundos.
- [x] 8.5 Revisar el recorrido real de Keycloak/MongoDB y la interfaz en 360/1280 px; la integración con proveedores se validó en 7.2.
- [x] 8.6 Configurar el Home URL de invoices-web hacia `/login` en realm nuevo y existente; verificar que Compose es válido y que Keycloak devuelve a la pantalla de autenticación de la aplicación.
- [x] 8.7 Implementar Mis invitaciones autenticado por correo verificado, acciones por ID/version sin token del enlace, navegación visible tras volver de Keycloak y guía desde la selección vacía; probar que no se devuelven datos de otra cuenta ni se permite actuar en estados terminales.
- [x] 8.8 Redirigir el regreso de acciones de Keycloak a `/login` con mensaje de autenticación y llevar a Mis invitaciones después del login cuando no existan contextos organizacionales; probar el acceso directo a ambas rutas.

## 9. Continuación autenticada y activación de contexto — 2026-11-15

- [x] 9.1 Mostrar Aceptar/Rechazar solo si la sesión autenticada corresponde al correo destinatario; sin sesión o con otra cuenta ofrecer login/registro y precargar recipientEmail.
- [x] 9.2 Después de iniciar autenticación desde una invitación, redirigir el callback OIDC a Mis invitaciones usando un destino permitido sin persistir el secreto.
- [x] 9.3 Después de aceptar desde el enlace o la bandeja, resolver y seleccionar el contexto de la organización invitada, con selector manual si falla.
