# Proposal

## Why

Invoices App ya autentica usuarios y calcula permisos, pero no dispone de asociaciones persistidas ni de una selección organizacional usable. Este cambio permitirá entrar y cambiar entre empresas o terceros autorizados, conservando el aislamiento y reutilizando la autorización del backend.

## What Changes

- Resolver contextos disponibles desde asociaciones y organizaciones activas; seleccionar automáticamente una única organización, solicitar elección entre varias y ofrecer una salida clara cuando no haya ninguna.
- Separar GLOBAL de COMPANY y THIRD_PARTY. APP_ADMIN conserva solo sus permisos administrativos globales; operar en una organización exige capacidad local y rol operativo admitidos por la política existente.
- Añadir lectura mínima de organizaciones, asociaciones funcionales y relaciones empresa-tercero en Organizations, con revisiones, sin CRUD administrativo.
- Conectar `OrganizationAccessReader` y el consumidor frontend `setContext` existentes, sin duplicar políticas, autenticación ni stores de permisos.
- Incorporar selección responsive MUI, indicador de contexto, cambio durante la sesión, guards, restauración validada por pestaña, limpieza de datos y control de concurrencia.
- Proponer API sin contexto activo persistido en servidor: listado y resolución explícita; reutilizar `/api/auth/permissions` para actualización de permisos. Documentar la adaptación de los cuatro endpoints conceptuales solicitados.
- Definir auditoría mínima, contratos OpenAPI 3.1 y escenarios de pruebas unitarias, MongoDB, API y navegador.

## Capabilities

### New Capabilities

- `organization-context`: descubrimiento, resolución, selección, restauración y ciclo de vida del contexto de interacción, dentro del bounded context Organizations.

La capacidad solicitada tiene un límite específico. `organizations` solo existe como delta de `initial-invoices-app`: mantiene propiedad de asociaciones, administración y aislamiento por recurso. Esta propuesta concreta el flujo de selección previsto allí y consume esas invariantes, sin copiar sus requisitos ni crear otro bounded context. La referencia de `implement-authorization/design.md` a selección «bajo organizations» deberá reconciliarse documentalmente al sincronizar; no modifica la propiedad del módulo. No se crean deltas de autenticación ni de política de permisos.

### Modified Capabilities

Ninguna especificación principal cambia en esta propuesta. Las tres vigentes corresponden a foundations; las deltas de autenticación y autorización aún no están sincronizadas.

## Impact

**Alcance futuro:** backend `modules/organizations`, composición de autorización, dos Route Handlers y contrato OpenAPI existente; frontend `modules/organization-context`, composición/rutas y conexión con autenticación/autorización. Aplicaciones independientes, mismas tecnologías y límites SOLID/DDD/Clean Architecture.

**Dependencias observadas:** foundations archivado en `archive/2026-11-08-initialize-foundations`; autenticación 27/27; autorización 24/32, con proveedor organizacional todavía indisponible. Este incremento aporta el proveedor y selector que desbloquean sus tareas 6.1–6.2. Fleet, Invoices, Configuration y Audit reales siguen pendientes; no se declararán completas sus integraciones mediante dobles. Se requiere política inicial MongoDB y datos organizacionales suministrados por un proceso administrativo autorizado; no se inventan asociaciones al iniciar sesión.

**Riesgos:** lecturas por solicitud, carreras con revocación, permisos JWT vigentes hasta expirar, datos iniciales ausentes, auditoría integral pendiente y solapamiento documental con la propuesta inicial. El diseño define resultados seguros y condiciones de aceptación para cada caso.

**Exclusiones:** código o instalaciones en esta etapa, CRUD completo de empresas/terceros/asociaciones, pantallas de facturación/flota, permisos nuevos, cambios de tokens o login, microservicios, despliegue, sincronización/archivo y ejecución de tareas de otros cambios. Todos los artefactos quedan para revisión; implementar requiere aprobación posterior.
