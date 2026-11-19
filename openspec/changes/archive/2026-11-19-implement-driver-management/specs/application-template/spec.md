# Application Template Specification Delta

## MODIFIED Requirements

### Requirement: Acciones visibles de módulos
La aplicación MUST ubicar Roles y permisos dentro de Configuración. Los listados de empresa y vehículo MUST exponer acciones de editar y desactivar cuando la sesión tenga permiso. El listado de conductores MUST reemplazar el marcador por la gestión conectada al contexto de tercero: MUST exponer detalle y activar/desactivar cuando la sesión tenga el permiso correspondiente, y MUST NOT ofrecer editar nombre, identificación, correo, credenciales, roles ni memberships canónicos.

#### Scenario: Acciones de una empresa

- **WHEN** un usuario autorizado consulta el listado de empresas
- **THEN** cada empresa muestra Editar y Desactivar como acciones disponibles

#### Scenario: Acciones de conductor

- **WHEN** un THIRD_PARTY_ADMIN abre Conductores en un contexto de tercero autorizado
- **THEN** ve acciones de detalle y de transición de estado según sus permisos, sin controles para editar datos personales canónicos
