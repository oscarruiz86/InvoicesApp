# Propuesta

## Why (Motivación)

Invoices App ya autentica usuarios con Keycloak, pero sus roles no expresan permisos sobre recursos ni asociaciones organizacionales. Antes de incorporar módulos de negocio necesita una autorización centralizada que impida acceso horizontal y permita verificar decisiones en backend con independencia de la interfaz.

## What Changes (Cambios propuestos)

- Definir el catálogo `resource:action`, la matriz inicial de los cuatro roles existentes y alcances global, organizacional y propio; las decisiones pendientes se deniegan por defecto.
- Añadir políticas puras y casos de uso de permisos efectivos y acceso a recursos dentro de Identity & Access, reutilizando el actor y la verificación JWT existentes.
- Consumir contratos de Organizations para asociaciones activas y contexto, y de los módulos propietarios para estado, pertenencia y elegibilidad de recursos. No implementar sus CRUD ni selección de contexto.
- Proponer `GET /api/auth/permissions`, sin alterar `/api/auth/me` ni crear un segundo endpoint de contexto. Documentar OpenAPI 3.1, errores y protección reutilizable de handlers.
- Extender la protección de rutas existente con permisos, hooks, estado Zustand y acciones/navegación condicionadas por contexto, con invalidación de respuestas obsoletas.
- Definir actualización de roles, asociaciones y políticas; auditoría de seguridad; pruebas de denegación sin efectos y límites entre autorización y reglas de negocio.

## Capacidades

### Capacidades nuevas

- `identity-access`: añadir requisitos de autorización por permisos y alcance al mismo nombre utilizado por `initial-invoices-app` e `implement-authentication`. Es nueva únicamente respecto de `openspec/specs/`: autenticación está implementada y su cambio sigue sin archivar. Esta delta añade requisitos con títulos distintos, sin copiar sus requisitos de autenticación.

### Capacidades modificadas

- `frontend-shell`: añadir consumo de permisos efectivos, protección de rutas/acciones y sincronización de contexto/sesión; reutilizar el guard de autenticación existente.

No existen capacidades con rutas `authorization`, `authentication` u `organization-context` en el inventario principal. Crear esos nombres duplicaría `identity-access` y `organizations`. Los contratos de consumo de Organizations se especifican aquí, preservando la propiedad de sus asociaciones y selección de contexto. No se alteran las specs base ni los cambios anteriores.

## Impacto

La futura implementación ampliará `backend/src/modules/identity`, bootstrap, errores HTTP y `backend/openapi/openapi.json`; frontend ampliará su módulo `authentication`, composición, transporte y presentación. Reutilizará React/Vite/TypeScript/MUI/Zustand/React Router y Next.js/TypeScript/Mongoose/Zod/Keycloak existentes, sin nueva infraestructura obligatoria ni dependencia de frameworks en capas internas.

Se revisaron `initial-invoices-app`, foundations en `archive/2026-11-08-initialize-foundations`, `implement-authentication`, specs principales, código y pruebas. `implement-organization-context` todavía no existe: su contrato y persistencia son dependencia explícita, nunca sustituidos por asociaciones ficticias. Fleet, Invoices, Configuration y Audit conservan sus reglas y entregas propias.

La propuesta original creó solo artefactos. El usuario autorizó después la implementación mediante `$openspec-apply-change implement-authorization`; su avance y evidencia están en `tasks.md` y `docs/authorization-progress.md`. Se conservan los límites de alcance: sin CRUD ni selector de otros módulos, despliegue, sincronización de specs o archivo automático. La matriz detallada, decisiones pendientes, dependencias y aceptación están en `design.md`.
