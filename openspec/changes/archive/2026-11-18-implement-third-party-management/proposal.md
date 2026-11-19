# Proposal

## Why

Las empresas ya pueden administrarse y el sistema reconoce terceros, relaciones empresariales, invitaciones y contextos de tercero, pero no existe una fuente administrativa para crear, relacionar y mantener esos terceros. Sin ese ciclo de vida, los flujos de conductores, vehículos e invitaciones a terceros dependen de datos inexistentes o creados fuera de la aplicación.

## What Changes

- Incorporar la gestión administrativa de terceros dentro del contexto `Organizations`: alta, consulta paginada, detalle, edición, activación y desactivación sin borrado físico.
- Gestionar relaciones explícitas y auditables entre empresas y terceros, con una relación activa única por pareja y posibilidad de que un tercero se relacione con más de una empresa.
- Mantener una proyección `Organization` compatible para cada tercero y reutilizar las asociaciones, contextos, invitaciones y permisos existentes sin crear una vía paralela de usuarios o roles.
- Mantener el perfil personal de `THIRD_PARTY_ADMIN` fuera de esta gestión: por ser una identidad Keycloak, únicamente el propio usuario puede ajustarlo conforme al contrato de invitaciones.
- Aplicar validación, normalización, aislamiento por ámbito, control de versión y confirmación transaccional de las escrituras.
- Exponer un contrato REST/OpenAPI y una interfaz React accesible y responsive para administrar terceros desde una empresa autorizada.
- Documentar la transición de estado de tercero o relación y su efecto sobre contextos, invitaciones pendientes y operaciones dependientes, sin implementar módulos de flota o facturación.

## Capabilities

### New Capabilities

- `third-party-management`: ciclo de vida, relación empresa-tercero, consultas aisladas, cambios de estado y administración autorizada de terceros.

### Modified Capabilities

- `application-template`: navegación administrativa y patrones de interfaz para el módulo de terceros autorizado.
- `user-invitations`: elegibilidad de terceros y relaciones empresa-tercero al invitar, aceptar, reenviar o administrar membresías de tercero.

## Impact

Backend: `src/modules/organizations`, sus adaptadores MongoDB y composición; nuevas rutas REST de terceros y contrato OpenAPI. Frontend: módulo `third-party-management`, navegación, transporte protegido y selección de terceros reutilizable por invitaciones. MongoDB requiere transacciones para confirmar tercero, proyección organizacional, relación y auditoría sin estados parciales; no se agregan dependencias.

Quedan fuera de alcance la gestión de identidades, credenciales y perfiles personales de Keycloak, el catálogo de roles o permisos, módulos de conductores, vehículos, asignaciones, facturas, despliegue y cambios generales de autenticación/autorización.
