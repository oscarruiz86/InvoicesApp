# Proposal

## Why

Invoices App necesita límites arquitectónicos explícitos antes de desarrollar sus módulos para que las reglas de facturación, vehículos y organizaciones sean verificables y evolucionen sin acoplarse a frameworks. SOLID, Domain-Driven Design (DDD) y Clean Architecture serán requisitos obligatorios tanto del frontend como del backend.

## What Changes

- Establecer los cinco principios SOLID y cuatro capas por módulo: Domain, Application, Infrastructure y Presentation, con dependencias dirigidas hacia las capas internas.
- Proponer y evaluar seis bounded contexts: Identity & Access, Organizations, Fleet Management, Invoice Management, Configuration y Audit; mantenerlos en un backend modular, sin introducir microservicios.
- Definir aplicaciones independientes: frontend React, Vite, TypeScript, Material UI y Zustand; backend Next.js exclusivamente REST, TypeScript, MongoDB, Mongoose, Keycloak y Swagger/OpenAPI.
- Separar entidades, invariantes, casos de uso, puertos y adaptadores. Mantener autorización organizacional y reglas de negocio autoritativas en el backend.
- Especificar validación del vehículo asignado, origen MANUAL/QR, ventana de edición parametrizable, restricción de edición QR y auditoría de facturas; ciclo de vida e historial de asignaciones de vehículos; asociaciones y aislamiento organizacional.
- Exigir pruebas por capa, contratos de repositorios y adaptadores, contratos REST y comprobaciones de dependencias arquitectónicas.
- Ordenar las tareas para definir y validar ambas arquitecturas antes de implementar módulos funcionales. La implementación requiere aprobación explícita posterior a la revisión de estos artefactos.

## Capabilities

### New Capabilities

- `project-foundation`: estándares SOLID/DDD/Clean Architecture, aplicaciones independientes, límites de módulos, contratos REST y estrategia de pruebas.
- `organizations`: empresas, terceros, asociaciones de usuarios, selección de contexto y aislamiento organizacional.
- `fleet-management`: vehículos, conductores, activación, desactivación, cambio de tercero e historial de asignaciones.
- `audit`: registro durable, sanitizado y recuperable de operaciones; la consulta queda deshabilitada hasta aprobar una política de acceso.

### Modified Capabilities

- `identity-access`: ampliar el requisito existente de roles generales para exigir verificación complementaria de permiso, asociación organizacional, contexto autorizado y propietario del recurso en cada operación.
- `configuration`: incorporar escenarios tipados y verificables para la política efectiva, su vigencia temporal y acceso administrativo.
- `invoice-management`: ampliar los requisitos existentes para asignación, origen MANUAL/QR, ventana temporal, autorización e historial recuperable.

Al crear la propuesta, la inspección disponible era solo documental y no encontraba especificaciones base, cambios previos ni código de aplicación. La implementación evolucionó después en cambios independientes; la clasificación actual refleja la especificación base existente de `identity-access` y la reconciliación registrada en `docs/initial-invoices-app-closure.md`.

## Impact

La propuesta se creó inicialmente como planificación documental. Posteriormente, las capacidades se implementaron en cambios OpenSpec independientes y se integraron en `development`; `docs/initial-invoices-app-closure.md` registra la evidencia y las decisiones P1–P7. La solicitud del usuario del 22 de noviembre de 2026 autoriza completar las tareas restantes y crear el commit de esta rama.

La arquitectura y las siete capacidades se reconciliaron con las decisiones vigentes. Audit conserva trazabilidad normalizada, entrega recuperable y retención de dos años; el historial permanece privado y no se publica una consulta hasta aprobar una política de acceso específica. Las deltas se sincronizaron con `openspec/specs/` y la propuesta se archivó el 22 de noviembre de 2026.
