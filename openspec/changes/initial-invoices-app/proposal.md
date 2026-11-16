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
- `identity-access`: autenticación mediante adaptadores Keycloak y separación de identidad, roles y autorización de recursos.
- `organizations`: empresas, terceros, asociaciones de usuarios, selección de contexto y aislamiento organizacional.
- `fleet-management`: vehículos, conductores, activación, desactivación, cambio de tercero e historial de asignaciones.
- `invoice-management`: captura manual/QR, validación de asignación, edición controlada y auditoría de modificaciones.
- `configuration`: parámetros funcionales tipados y acceso mediante contratos, incluida la política temporal de edición.
- `audit`: trazabilidad de operaciones y acceso autorizado al historial.

### Modified Capabilities

Ninguna. En el directorio inspeccionado existe la configuración OpenSpec, pero no hay especificaciones base, cambios previos ni código de la aplicación. Estos artefactos constituyen la base documental del cambio solicitado; no sustituyen una propuesta anterior no disponible.

## Impact

El alcance de esta entrega se limita a los artefactos de planificación de `initial-invoices-app`. No se genera código, no se instalan dependencias, no se crean implementaciones ni se modifican funcionalidades existentes. Las estructuras descritas son propuestas documentales; las integraciones, contratos ejecutables, persistencia y pruebas se realizarán únicamente tras aprobación.

Las decisiones funcionales pendientes y sus consecuencias se registran en `design.md`. Completar los artefactos OpenSpec no constituye aprobación de implementación ni resolución automática de esas decisiones.
