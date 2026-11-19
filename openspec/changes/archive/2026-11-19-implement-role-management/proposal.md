# Proposal

## Why

Invoices App ya calcula permisos efectivos y persiste una política versionada, pero no permite a los administradores globales inspeccionar ni modificar de forma controlada la matriz de roles. Sin una superficie administrativa, los cambios de acceso exigen intervenir datos técnicos y no ofrecen revisión, validación ni trazabilidad suficiente.

## What Changes

- Incorporar la gestión de la política local de roles y permisos mediante un catálogo cerrado de `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`.
- Permitir exclusivamente a APP_ADMIN en ámbito GLOBAL consultar y reemplazar los grants de la política vigente, con versión esperada, validación del techo de grants y auditoría atómica.
- Exponer el contrato REST/OpenAPI de lectura y actualización sin administrar roles, credenciales, perfiles ni asignaciones de Keycloak.
- Añadir la pantalla Roles y permisos dentro de Configuración, con matriz accesible, confirmación de cambio, conflicto de versión e invalidación de permisos y navegación afectada.
- Proteger la continuidad administrativa: una modificación no puede dejar la política sin los grants globales efectivos `roles:read` y `roles:manage` para APP_ADMIN ni eliminar las facultades necesarias del actor que confirma el cambio.

## Capabilities

### New Capabilities

- `role-management`: consulta y actualización segura de la política local de roles, permisos y ámbitos permitidos.

### Modified Capabilities

- `application-template`: acceso, navegación y comportamiento de interfaz del módulo Roles y permisos para APP_ADMIN global autorizado.

## Impact

Backend: se ampliarán Identity & Access, bootstrap, handlers REST y OpenAPI, reutilizando `AuthorizationPolicy`, `grantCeiling`, control de versión y auditoría existentes. Frontend: se añadirá un módulo de gestión de roles, transporte protegido, rutas, navegación y sincronización del snapshot de autorización.

No se añaden dependencias ni se modifica Keycloak. Quedan fuera de alcance crear, borrar o renombrar roles; gestionar asociaciones, invitaciones o perfiles personales; cambiar permisos fuera del `grantCeiling`; módulos de negocio, despliegue y cambios generales de autenticación. Esta entrega solo genera planificación.
