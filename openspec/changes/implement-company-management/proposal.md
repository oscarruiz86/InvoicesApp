# Proposal

## Why

Invoices App ya valida identidad, permisos y contextos organizacionales, pero carece de un escritor administrativo de empresas y asociaciones. Este incremento permite gestionar empresas con aislamiento, historial y trazabilidad, reutilizando Organizations e Identity & Access.

## What Changes

- Incorporar Company en Organizations, con identificación tributaria única, datos de contacto, estado y metadatos de servidor; persistir en `companies` sin administradores embebidos ni eliminación física.
- Crear listado paginado, búsqueda, filtros, detalle, registro, edición y activación/desactivación mediante REST y UI React/Material UI.
- Mantener la representación organizacional existente y sus revisiones en la misma confirmación que Company; invalidar acceso operativo al desactivar sin eliminar asociaciones ni recursos relacionados.
- Consultar administradores y asociar/desasociar identidades COMPANY_ADMIN existentes mediante `organization_associations`, con validación de identidad y restricciones de delegación actuales.
- Aplicar permisos y pertenencia en backend, filtros antes de conteos/paginación y comprobación de revisiones al confirmar escrituras. Capturar auditoría durable de cada modificación.
- Documentar contratos OpenAPI 3.1 y verificar dominio, REST, persistencia real, concurrencia e interfaz responsive.

## Capabilities

### New Capabilities

- `company-management`: ciclo administrativo de empresas, datos tributarios, consultas aisladas, asociaciones de administradores, coherencia organizacional y auditoría de sus operaciones.

### Modified Capabilities

Ninguna. Las especificaciones principales actuales describen foundations; sus límites de incremento no se reinterpretan como prohibiciones permanentes. `organizations`, `identity-access`, `organization-context` y `audit` están en cambios previos aún no archivados: se consumen sus contratos sin duplicarlos ni modificar esos cambios. Esta capacidad concreta el CRUD que aquellos reservan para un escritor futuro.

## Impact

Backend: `src/modules/organizations`, composición en `src/bootstrap`, Route Handlers `/api/companies`, contrato `openapi/openapi.json` y pruebas. Frontend: nuevo módulo `company-management`, rutas, navegación y extensión acotada del transporte protegido existente. Identity aporta un contrato de lectura de identidad destinataria y participación transaccional de política, sin nuevo catálogo de permisos ni gestión de usuarios/roles.

MongoDB requiere transacciones para Company, proyección organizacional, asociaciones y eventos; el Compose actual es standalone y necesitará configuración replica set local como requisito específico de este CRUD. Keycloak se consulta únicamente para validar destinatarios existentes. No se añaden dependencias en esta propuesta.

Fuera de alcance: CRUD de terceros/usuarios, asignación de roles Keycloak, relaciones empresa-tercero, flota, facturas, visor/entrega/retención integral de Audit, refactorizaciones generales, despliegues y cierre de tareas pendientes de otros cambios. Esta entrega contiene exclusivamente planificación.
