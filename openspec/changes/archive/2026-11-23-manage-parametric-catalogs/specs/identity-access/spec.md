# Spec Delta

## MODIFIED Requirements

### Requirement: Registro y perfil para invitaciones
El registro autónomo y el perfil propio MUST residir en Keycloak conforme a `implement-user-invitations`. MUST incluir nombre completo, correo, tipo documental personal disponible en el catálogo y número documental colombiano; el correo MUST ser no editable en el perfil normal. La aceptación MUST exigir correo actual verificado y perfil completo por puerto de Identity.

#### Scenario: Retorno de invitación sin contexto
- **WHEN** el destinatario se registra o inicia sesión desde una invitación
- **THEN** vuelve a revisarla sin requerir contexto operativo y sin aceptar ni verificar correo automáticamente

#### Scenario: Identidad informativa y autorización local
- **WHEN** se consulta `/api/auth/me` y luego se solicita una operación organizacional
- **THEN** `/me` representa los claims básicos del token; el perfil compartido se lee del proveedor y los roles locales de memberships activas, sin autorizar por roles organizacionales del token
- **AND** APP_ADMIN conserva su fuente global verificada

#### Scenario: Tipo documental provisto por catálogo
- **WHEN** se ofrece el campo de tipo documental en registro o perfil
- **THEN** sus opciones corresponden a códigos y etiquetas disponibles del catálogo y el backend rechaza códigos no permitidos
- **AND** este catálogo personal ofrece CC, CE, TI, RC, PA y PPT, separado de NIT y CC de empresas/terceros
