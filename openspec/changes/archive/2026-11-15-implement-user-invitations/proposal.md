# Proposal

## Why

La aplicación asocia administradores inmediatamente por identificador Keycloak y exige roles organizacionales en el token. Se necesita una aceptación explícita del usuario, registro autónomo y un flujo uniforme para administradores de empresa, de tercero y conductores, sin cambiar los permisos de negocio.

## What Changes

- Ajuste 2026-11-15: ofrecer Ya tengo cuenta y Crear mi cuenta, registro directo en Keycloak, cambio de cuenta y retorno recuperable durante 60 minutos limitado por el vencimiento del enlace. Mantener invitaciones de 72 horas por defecto y mensajes específicos para correo no verificado y perfil incompleto.

- Incorporar invitaciones por correo destinatario, organización y roles, con aceptación, rechazo, cancelación, vencimiento, reenvío e historial consultable.
- **BREAKING**: sustituir el alta directa de asociaciones por invitación; los usuarios ya activos gestionan sus roles sin reinvitación, con mínimo un rol.
- Registrar cuentas en Keycloak con nombre completo, correo, tipo y número de documento colombiano; la aplicación nunca recibe contraseñas. Verificar correo antes de aceptar.
- **BREAKING**: obtener roles organizacionales de asociaciones locales aceptadas y activas, preservando APP_ADMIN global, aislamiento y matriz de permisos.
- Compartir únicamente nombre completo, tipo y número de documento y correo con organizaciones autorizadas mediante asociación activa.
- Implementar un puerto de entrega de invitaciones con adaptador provisional de log: escribir el enlace completo para probar apertura y aceptación, sin servicio de correo ni plataforma de notificaciones.
- Separar historial de invitaciones, pertenencia y asignaciones de roles; auditar cambios y conservar la procedencia de asociaciones anteriores.
- Adaptar API, contratos, pantallas y pruebas. No implementar notificaciones de cambios de roles ni cierre forzado de sesión en esta fase.

## Capabilities

### New Capabilities

- `user-invitations`: incorporación de usuarios a organizaciones mediante invitaciones, aceptación de identidad, perfil compartido y mantenimiento de roles de la relación.

### Modified Capabilities

Ninguna de las capacidades archivadas en `openspec/specs`. Los contratos afectados de `identity-access`, `organization-context`, `company-management` y `application-ui-design` pertenecen a cambios todavía no archivados. Este cambio declara sus ajustes y precedencia en design.md; no fabrica deltas MODIFIED contra capacidades inexistentes ni modifica sus tareas históricas.

## Impact

Backend: Identity, Organizations, composición, repositorios MongoDB, contratos OpenAPI y pruebas. Frontend: autenticación, contexto, empresas y nuevas pantallas de invitaciones/usuarios vinculados. Keycloak: perfil, registro, verificación de correo y configuración de edición del correo. Requiere transición controlada de asociaciones actuales; no se resembrará la política.

Fuera de alcance: edición de permisos de roles, proveedor real de notificaciones, notificación automática y cierre de sesión por cambios de roles, CRUD completo de terceros/flota, despliegue y cambios de código durante esta propuesta.
