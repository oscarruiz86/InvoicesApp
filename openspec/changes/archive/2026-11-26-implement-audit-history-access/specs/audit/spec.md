# Spec Delta

## ADDED Requirements

### Requirement: Consulta del journal central por administradores globales
Solo APP_ADMIN con `audit:read` en ámbito GLOBAL MUST consultar los eventos centrales mediante listado paginado y detalle de solo lectura. La respuesta MUST limitarse a campos normalizados y filtros controlados, sin revelar payloads, representaciones ni datos sensibles.

#### Scenario: Consulta global autorizada
- **WHEN** APP_ADMIN con `audit:read` solicita listado o detalle con ámbito GLOBAL
- **THEN** recibe únicamente campos seguros de eventos dentro de la retención vigente y una paginación estable

#### Scenario: Rol o ámbito no autorizado
- **WHEN** COMPANY_ADMIN, THIRD_PARTY_ADMIN, DRIVER o un actor sin ámbito GLOBAL intenta consultar el journal
- **THEN** recibe 403 sin revelar si el evento o filtro existe

#### Scenario: Filtros inválidos
- **WHEN** la solicitud contiene filtros, orden o tamaño de página no admitidos
- **THEN** recibe 400 sin consulta parcial ni divulgación de eventos

#### Scenario: Consulta de evento vencido o inexistente
- **WHEN** se solicita un identificador no disponible dentro de la retención vigente
- **THEN** recibe 404 neutro sin distinguir evento inexistente de evento expirado

### Requirement: Etiquetas legibles para historial de auditoría
La interfaz MUST mostrar una etiqueta natural en español para acciones normalizadas. Puede mostrar el nombre completo actual de un usuario si lo resuelve Identity Directory; si no, MUST conservar el ID. No debe exponer correo, documento ni roles. Las fechas visibles MUST usar zona horaria `America/Bogota` (COT); los filtros y la API mantienen instantes UTC.

#### Scenario: Directorio resuelve al actor
- **WHEN** Identity Directory encuentra un nombre completo actual para el actor
- **THEN** la lista muestra ese nombre y el detalle mantiene el ID junto con el nombre

#### Scenario: Directorio no disponible
- **WHEN** Identity Directory no resuelve el nombre o no responde
- **THEN** la consulta sigue disponible y la interfaz muestra el ID del actor

#### Scenario: Presentación horaria local
- **WHEN** se presenta la fecha de un evento o un detalle
- **THEN** la hora se muestra en COT y los valores de filtros continúan identificados y enviados como UTC

### Requirement: Identificación de entidades en detalle de auditoría
El detalle MUST asociar IDs disponibles de empresa y tercero con sus nombres administrativos actuales, conservar cada ID y permitir consulta si la entidad no se puede resolver.

#### Scenario: Entidad resuelta
- **WHEN** el detalle incluye una empresa o tercero existente
- **THEN** muestra nombre e ID asociados

#### Scenario: Entidad no disponible
- **WHEN** no se puede resolver el nombre de empresa o tercero
- **THEN** muestra el ID sin bloquear la consulta

### Requirement: Filtrado por actor
El listado MUST permitir filtrar por nombre de actor o identificador. El filtro se aplica al sujeto antes de paginar, queda vinculado al cursor y no se registra como valor de búsqueda en el evento de lectura.

#### Scenario: Búsqueda por nombre de actor
- **WHEN** APP_ADMIN aplica un nombre de usuario como filtro
- **THEN** el servicio resuelve coincidencias en Identity Directory y lista solo eventos de esos sujetos

#### Scenario: Búsqueda por identificador de actor
- **WHEN** APP_ADMIN aplica el ID de un actor
- **THEN** el journal se filtra por el sujeto exacto

#### Scenario: Directorio de identidad no disponible
- **WHEN** no se puede buscar un nombre en Identity Directory
- **THEN** la consulta no falla y trata el valor como sujeto exacto para permitir búsquedas por ID

### Requirement: Publicación de capturas heredadas de Organizaciones
El catálogo de auditoría MUST aceptar `COMPANY_ADMIN_ASSOCIATED` para que capturas transaccionales existentes puedan publicarse en el journal.

#### Scenario: Asociación de administrador de empresa en outbox
- **WHEN** el worker procesa una captura `COMPANY_ADMIN_ASSOCIATED`
- **THEN** la registra como evento seguro de Organizaciones y confirma su entrega

### Requirement: Acceso al historial queda auditado
Cada consulta autorizada al historial MUST generar un hecho de acceso con actor verificado, instante, correlación y resultado, sin copiar filtros libres, valores de búsqueda ni contenido de los eventos consultados.

#### Scenario: Lectura de listado o detalle
- **WHEN** se completa una consulta autorizada de auditoría
- **THEN** se registra un evento `AUDIT_HISTORY_READ` con referencias seguras y sin datos de búsqueda

#### Scenario: Falla al registrar el acceso
- **WHEN** la consulta no puede guardar su propio hecho de acceso durable
- **THEN** no devuelve resultados del journal y responde con indisponibilidad normalizada

## MODIFIED Requirements

### Requirement: Historial privado hasta aprobar una política de consulta
Audit MUST NOT exponer un endpoint de historial ni conceder `audit:read` sin una política aprobada de consulta, autorización, ámbito y retención. Bajo esa política, el acceso queda restringido a actores y ámbitos autorizados. Los registros MUST ser append-only y conservar hechos distinguibles conforme a la política de retención vigente.

#### Scenario: Consulta sin política aprobada
- **WHEN** un actor intenta consultar historial antes de aprobarse la política de acceso
- **THEN** la aplicación no expone el endpoint ni devuelve registros de auditoría

#### Scenario: Consulta con política aprobada
- **WHEN** APP_ADMIN con `audit:read` consulta historial en ámbito GLOBAL
- **THEN** recibe únicamente los eventos normalizados permitidos por la política y dentro de la retención vigente

#### Scenario: Nueva modificación del mismo recurso
- **WHEN** una nueva modificación de factura genera trazabilidad
- **THEN** Audit conserva un hecho distinguible sin sobrescribir el anterior

### Requirement: Sin consulta transversal de auditoría
El journal compartido MUST NOT exponerse sin una política aprobada de acceso y autorización. La consulta transversal solo queda disponible para actores y ámbitos autorizados por esa política. Las consultas funcionales existentes sobre historiales locales MUST conservar sus permisos y contratos.

#### Scenario: Consulta al journal central sin política aprobada
- **WHEN** se solicita un historial central de auditoría sin una política de acceso aprobada
- **THEN** no se devuelve información ni se habilita una ruta de consulta

#### Scenario: Consulta al journal central bajo política aprobada
- **WHEN** APP_ADMIN con `audit:read` consulta con ámbito GLOBAL
- **THEN** recibe los eventos seguros permitidos por la política vigente

#### Scenario: Consulta funcional existente
- **WHEN** un módulo consulta un historial propio permitido por su contrato actual
- **THEN** la incorporación de eventos al journal central no cambia su alcance, orden ni autorización
