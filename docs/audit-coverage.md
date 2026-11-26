# Matriz de cobertura de auditoría

`eventId` identifica un hecho de negocio y se mantiene sin cambios durante toda
entrega/reentrega. El mapeo usa el actor autenticado o el actor del evento local,
la correlación generada por el servidor, el ámbito ya validado y el ID opaco del
recurso. Versiones solo se incluyen cuando son parte del evento persistido. No
se copian documentos, payloads, nombres, correos, números de documento, secretos,
imágenes ni valores completos de parámetros.

| Módulo / colección local | Mutación confirmada | Actor y correlación | Recurso / ámbito | Origen central / acción prevista |
| --- | --- | --- | --- | --- |
| Organizations / company_management_events | Crear, actualizar, activar, desactivar compañía | actor verificado / correlationId | compañía / scope de organización | `organizations` / `COMPANY_*` |
| Organizations / third_party_management_events | Crear, actualizar, activar, desactivar tercero; activar/desactivar asociación | actor verificado / correlationId | tercero / compañía y tercero validados | `organizations` / `THIRD_PARTY_*`, `RELATIONSHIP_*` |
| Organizations / organization_invitation_events | Crear, reenviar, aceptar y expirar invitación | actor verificado cuando está disponible / ID de evento | invitación / organización | `organizations` / `INVITATION_*`; sin token, hash ni enlace |
| Organizations / organization_membership_events, organization_associations | Actualizar membresía/asociación | actor verificado / ID de operación | membresía / organización | `organizations` / `MEMBERSHIP_UPDATED`; sin claims ni detalles de perfil |
| Organizations / organization_context_events | Seleccionar, cambiar, restaurar o invalidar contexto; denegación contextual | sujeto verificado / correlationId | contexto validado, si aplica | `organizations` / acciones `CONTEXT_*` existentes |
| Fleet / driver_management_events | Provisión, migración y cambio de estado de conductor | actor / ID de evento local | conductor / tercero | `fleet` / `DRIVER_PROVISIONED`, `DRIVER_MIGRATED`, `DRIVER_ACTIVATED`, `DRIVER_DEACTIVATED`; sin identidad personal |
| Fleet / vehicle_management_events | Crear, editar y cambiar estado de vehículo | actor autenticado / correlationId | vehículo / tercero | `fleet` / `VEHICLE_CREATED`, `VEHICLE_UPDATED`, `VEHICLE_ACTIVATED`, `VEHICLE_DEACTIVATED`; sin placa ni tarjeta |
| Fleet / assignment_events | Crear y cerrar asignación | actor autenticado / correlationId | asignación / tercero | `fleet` / `ASSIGNMENT_CREATED`, `ASSIGNMENT_CLOSED` |
| Invoices / invoice_events | Crear y editar factura | actor autenticado / correlationId | factura / tercero | `invoices` / `INVOICE_CREATED`, `INVOICE_UPDATED`; solo campos modificados permitidos |
| Invoice Sync / invoice_sync_resolution_events | Vincular duplicado, aprobar excepción de asignación, rechazar | actor administrativo / ID de evento | envío / tercero | `invoice-sync` / acción de resolución; sin imagen, QR, CUFE, URL ni contenido |
| Configuration / configuration_events | Inicializar o cambiar parámetro funcional | actor administrativo / correlationId | clave de parámetro / global | `configuration` / acción tipada; sin valores anterior/nuevo |
| Parametric Catalogs / parametric_catalog_events | Crear, editar, reactivar o desactivar entrada | actor administrativo / ID de evento | catálogo y código / global | `parametric-catalogs` / acción tipada; sin etiquetas ni payload de fila |

La mutación y el evento central se escriben en la transacción propietaria donde
esta existe. Las capturas Company/Third Party pendientes se entregan con el
mismo `eventId` mediante outbox y se confirman solo después de aceptar Audit.
Los historiales locales siguen siendo las fuentes de sus consultas funcionales.

Esta matriz cubre solo operaciones aprobadas por el cambio OpenSpec
`implement-audit-logging`; no habilita lectura central, `audit:read`, ni captura
de administración Keycloak en producción. No se realiza backfill de historiales
anteriores.
