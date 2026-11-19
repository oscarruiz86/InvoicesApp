# User Invitations Specification Delta

## MODIFIED Requirements

### Requirement: Aceptación explícita y atómica
La aceptación MUST mostrar organización, roles y los cuatro campos compartidos. MUST revalidar organización activa, autoridad actual del remitente y roles permitidos, y confirmar invitación, pertenencia, roles y auditoría de forma atómica. Cuando el rol aceptado sea únicamente DRIVER para un tercero, MUST confirmar en la misma transición un conductor operativo ACTIVE vinculado al subject y membership resultantes, sin crear ni modificar el perfil de Keycloak.

#### Scenario: Aceptación válida
- **WHEN** el destinatario confirma una invitación elegible
- **THEN** queda aceptada y la asociación activa con sus roles
- **AND** si la invitación es DRIVER de un tercero, queda además un único conductor ACTIVE vinculado a esa asociación

#### Scenario: Condiciones revocadas
- **WHEN** la organización se desactiva o el remitente pierde autoridad antes de aceptar
- **THEN** se rechaza la aceptación sin activar acceso ni crear conductor

#### Scenario: Concurrencia
- **WHEN** se acepta dos veces o se compite con una cancelación
- **THEN** solo una transición válida se confirma sin duplicar pertenencia, roles, conductor ni auditoría

### Requirement: Roles de usuarios ya activos
Una asociación activa MUST permitir agregar o retirar roles autorizados sin reinvitación, conservando al menos uno compatible con su organización. MUST NOT permitir editar los permisos que componen los roles ni conceder roles fuera de la facultad del actor. Al agregar DRIVER a una membership de tercero, MUST materializar su conductor local único si no existe y conservar el estado previo si ya existe; al retirar DRIVER, MUST conservar el historial e inactivar ese conductor en la misma transición.

#### Scenario: Cambio autorizado
- **WHEN** se modifica el conjunto de roles de un usuario activo
- **THEN** se guarda y audita sin generar otra invitación
- **AND** agregar o retirar DRIVER sincroniza el conductor local sin cambiar datos de Keycloak

#### Scenario: Último rol
- **WHEN** se solicita retirar el único rol
- **THEN** se rechaza y se ofrece desactivar la asociación o sustituir el rol atómicamente

#### Scenario: Cambio sin efecto
- **WHEN** se guarda el mismo conjunto de roles
- **THEN** no se crean cambios ni eventos duplicados
