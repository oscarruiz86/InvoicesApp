# Proposal

## Why

Fleet ya administra conductores, pero Vehículos conserva una interfaz provisional sin servicios backend ni los tres campos mínimos acordados. Se necesita un maestro operativo autorizado y versionado para sustentar las futuras asignaciones y la facturación.

## What Changes

- Crear vehículos con placa, número interno y número de tarjeta de propiedad obligatorios, sin ampliar la ficha operativa.
- Proponer placa única global, número interno único por tercero y tarjeta de propiedad única global, incluyendo registros inactivos, con normalización e índices resistentes a concurrencia.
- Permitir a THIRD_PARTY_ADMIN administrar vehículos de su tercero activo según permisos vigentes.
- Restringir DRIVER a vehículos activos con asignación activa propia y conductor elegible; sin proveedor de asignaciones no se concede acceso operativo.
- Publicar listado, detalle, alta, edición y estado mediante REST/OpenAPI y conectar la interfaz Fleet existente.
- Conservar propietario inmutable, historial y auditoría local duradera; bloquear la desactivación con asignación abierta. Transferencias y gestión de asignaciones se desarrollarán en un cambio posterior.

## Capabilities

### New Capabilities

- `vehicle-management`: ficha mínima, unicidad, consulta aislada, edición versionada, estado y hechos de elegibilidad de vehículos.

### Modified Capabilities

Ninguna. Se implementan los patrones ya exigidos por application-template sin cambiar sus requisitos. La capacidad fleet-management de initial-invoices-app continúa como marco de referencia para transferencias y asignaciones futuras.

## Impact

Backend `modules/fleet`, bootstrap y rutas API; frontend `modules/fleet`, composición, transporte protegido y pruebas; MongoDB e índices; OpenAPI y documentación operativa. Se reutilizan Mongoose, Zod, autorización y contexto existentes, sin nuevas dependencias. Quedan fuera transferencia de propietario, CRUD de asignaciones, facturación, datos adicionales del vehículo y gestión de Keycloak.
