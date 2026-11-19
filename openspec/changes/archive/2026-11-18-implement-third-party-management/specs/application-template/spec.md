# Spec Delta

## ADDED Requirements

### Requirement: Navegación administrativa de terceros

La aplicación MUST mostrar la opción Terceros dentro de Administración cuando el contexto confirmado y los permisos vigentes permitan consultar terceros. MUST dirigirla a la gestión de terceros de la empresa activa o del ámbito global autorizado, y MUST ocultarla para sesiones sin ese permiso o ámbito. La navegación MUST conservar los estados de carga, contexto ausente y acceso denegado existentes.

#### Scenario: Empresa autorizada

- **WHEN** un COMPANY_ADMIN selecciona una empresa activa y tiene `third-parties:read`
- **THEN** ve Terceros dentro de Administración y puede abrir su listado limitado a esa empresa

#### Scenario: Sesión sin acceso

- **WHEN** un usuario sin `third-parties:read` abre el menú o intenta la ruta directamente
- **THEN** no ve la opción y la ruta muestra el estado seguro de acceso denegado sin datos de terceros

#### Scenario: Cambio de contexto

- **WHEN** el usuario cambia o pierde el contexto que habilitaba la gestión de terceros
- **THEN** la navegación y la vista descartan los datos dependientes y vuelven a evaluar los permisos confirmados
