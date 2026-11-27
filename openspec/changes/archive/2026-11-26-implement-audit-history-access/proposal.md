# Proposal

## Why

El journal compartido de Audit no puede consultarse y `audit:read` sigue pendiente para todos los roles administrativos. La aplicación ya muestra el área Auditoría en sus prototipos, pero no existe una política que determine quién ve los eventos, por lo que habilitar una ruta hoy podría exponer operaciones de otras organizaciones.

## What Changes

- Aprobar una primera política de consulta de solo lectura para `APP_ADMIN` en ámbito explícito `GLOBAL`; COMPANY_ADMIN, THIRD_PARTY_ADMIN y DRIVER continúan sin acceso.
- Exponer listado paginado y detalle de eventos centrales usando filtros controlados y únicamente campos normalizados permitidos.
- Habilitar `audit:read` solo para APP_ADMIN global y registrar cada consulta autorizada como un hecho de acceso auditado sin guardar filtros libres ni payloads.
- Implementar la pantalla Auditoría del prototipo con filtros, paginación y detalle de solo lectura; ocultarla para todo usuario sin el grant vigente.
- Mantener la retención de dos años, la privacidad de datos y las colecciones de historial funcional de los módulos.
- No importar historiales locales: el proyecto está en desarrollo y no existen datos históricos que migrar.
- No ofrecer exportación, borrado, edición de eventos ni consulta por parte de roles organizacionales en esta primera versión.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `audit`: sustituir la prohibición de consulta sin política por una política explícita de lectura global APP_ADMIN, API paginada, detalle seguro y registro de accesos.
- `identity-access`: conceder `audit:read` solo a APP_ADMIN global en la matriz inicial; los demás roles siguen denegados.

## Impact

Afecta `backend/src/modules/audit`, autorización, Route Handlers/OpenAPI, el módulo frontend Auditoría y la navegación condicionada por grants. Depende de la cobertura central de eventos de `implement-audit-logging` para presentar un historial transversal completo. No añade dependencias ni modifica las colecciones de negocio.
