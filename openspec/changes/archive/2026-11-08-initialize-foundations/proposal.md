# Proposal

## Why

Invoices App necesita una base técnica ejecutable y verificable antes de desarrollar sus capacidades funcionales. Este incremento concreta los estándares SOLID, DDD pragmático y Clean Architecture de `initial-invoices-app` en dos aplicaciones independientes y un entorno reproducible de desarrollo local.

## What Changes

- Preparar un frontend React, Vite y TypeScript con Material UI, Zustand y React Router: estructura modular por cuatro capas, tema global, layout responsive, pantalla provisional, configuración pública validada, cliente HTTP reutilizable y manejo central de errores.
- Preparar un backend Next.js y TypeScript dedicado a REST: estructura modular, composición explícita, validación de entorno con Zod, conexión reutilizable MongoDB/Mongoose y errores HTTP coherentes.
- Publicar `GET /api/health` como comprobación de vida independiente de MongoDB; publicar el contrato OpenAPI 3.1 en `/api/openapi` y documentación Swagger en `/api/docs`, sin páginas de producto en Next.js.
- Reservar los límites de los seis bounded contexts y preparar el punto de integración Keycloak con configuración opcional y contratos independientes del proveedor. No implementar login, validación real de tokens ni autorización de negocio en este incremento.
- Configurar pruebas de aplicación/presentación e infraestructura técnica y comprobaciones automatizadas de dependencias y ciclos en ambas aplicaciones.
- Preparar Dockerfiles independientes, Docker Compose de desarrollo con frontend/backend/MongoDB, red local, volumen de datos, ejemplos de entorno y README de ejecución y validación.

## Capabilities

### New Capabilities

- `frontend-shell`: aplicación web provisional navegable y responsive, configuración pública, estados de comunicación y errores, desacoplada de transporte y backend interno.
- `backend-runtime`: servicios técnicos REST, salud del proceso, contrato/documentación de API, entorno validado, conexión MongoDB reutilizable y límite de integración de identidad aún inactivo.
- `local-development`: instalación y compilación independientes, entorno Docker de desarrollo, resolución de red correcta, configuración de ejemplo y verificaciones reproducibles.

### Modified Capabilities

Ninguna. `openspec/specs/` no contiene especificaciones publicadas; `initial-invoices-app` sigue siendo un cambio de planificación activo, validado y sin tareas completadas. Sus siete capacidades conservan sus requisitos. Las nuevas capacidades describen comportamientos técnicos concretos y no vuelven a declarar ni modifican `project-foundation` o `identity-access`.

## Impact

La implementación futura afectará `frontend/`, `backend/`, Docker Compose, ejemplos de configuración y README raíz. Cada aplicación tendrá su propio manifiesto, lockfile, configuración, pruebas, imagen y ciclo de compilación. No se requiere un workspace de paquetes ni un paquete compartido de dominio.

Se han revisado `proposal.md`, `design.md`, las siete deltas y `tasks.md` de `initial-invoices-app`. El incremento corresponde parcialmente a sus bases técnicas (tareas 3.1–3.5), sin completar automáticamente tareas de esa propuesta ni implementar los contextos funcionales. Las decisiones de roles, facturación, QR, asignaciones y auditoría permanecen diferidas a sus cambios respectivos; no impiden una base técnica sin operaciones de negocio protegidas.

Esta entrega genera únicamente artefactos OpenSpec. La ejecución de las tareas requiere una aprobación explícita posterior de `initialize-foundations`; no autoriza aplicar toda la propuesta base. Quedan fuera login, CRUD de negocio, modelos Mongoose de negocio, transacciones/auditoría funcional, despliegue en TrueNAS y cualquier otro despliegue.
