# Registros de invitaciones y pertenencias

## Estados

Las invitaciones pasan de `PENDING` a un estado terminal: `ACCEPTED`, `REJECTED`, `CANCELLED` o `EXPIRED`. Una invitación vencida no se puede aceptar aunque su estado persistido todavía sea `PENDING`; al resolverla o crear un nuevo intento se persiste `EXPIRED` y se conserva el registro anterior.

La entrega se registra por separado como `UNKNOWN`, `LOGGED` o `FAILED`. Estos valores describen el resultado de la entrega técnica, no la aceptación del destinatario.

Las pertenencias usan `ACTIVE` o `INACTIVE`. `INVITATION` identifica una pertenencia aceptada mediante el flujo nuevo y conserva su invitación de origen y fecha de aceptación. `LEGACY` identifica una asociación migrada; no lleva fecha ni referencia de aceptación ficticia. Las asignaciones de rol permanecen en `organization_associations` y conservan su revisión.

## Eventos durables

`organization_invitation_events` registra creación, expiración y resolución de invitaciones, además de aceptación. `organization_membership_events` registra cambios de estado y roles, incluida la revisión antes y después. La transición y su evento se guardan en la misma transacción.

Los eventos contienen identificadores internos, organización, actor, acción, fecha, revisión y roles cuando hacen falta para describir el cambio. No contienen enlaces, hashes de secretos, tokens, correos ni números de documento. La colección de entrega de pruebas es independiente y tiene permisos de acceso más restrictivos porque incluye el enlace de aceptación.
