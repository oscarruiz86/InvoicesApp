# Proposal

## Why

El proyecto ya dispone de identidades, terceros y asignaciones de Flota, pero Facturas sigue sin una capacidad operativa propia. Se necesita registrar y consultar facturas manuales con referencias históricas, aislamiento y edición controlada.

## What Changes

- Incorporar alta MANUAL, listado, detalle y edición versionada de facturas.
- Capturar vehículo, fecha, hora, número de factura, NIT del emisor, documento del adquiriente, valor de factura, IVA, otros impuestos, valor total e imagen adjunta, según las imágenes aportadas por el usuario.
- Vincular cada factura al conductor propietario y a una asignación concreta del tercero; respetar las relaciones muchos a muchos actuales.
- Consumir una ventana parametrizada por un contrato de Configuration. Mientras el servicio no exista o no entregue evidencia válida, rechazar la edición dependiente sin inventar un plazo fijo.
- Reutilizar los componentes compartidos y patrones de Invitaciones en formularios, filtros, listados y confirmaciones.
- Conservar auditoría durable y referencias históricas sin modificar Keycloak.
- Dejar lectura QR para una propuesta propia: esta entrega no acepta origen QR declarado por el cliente ni incorpora escáner, parser o consultas DIAN.

## Capabilities

### New Capabilities

- `invoice-management`: Registro manual, consulta, adjunto protegido y edición controlada de facturas de un tercero.

### Modified Capabilities

Ninguna. `invoice-management` existe en la propuesta base, pero todavía no como especificación principal publicada. Este incremento no modifica los contratos de Flota ni habilita captura QR.

## Impact

Backend y frontend tendrán módulos `invoices` independientes y sus cuatro capas, rutas REST/OpenAPI, persistencia MongoDB, almacenamiento privado de imágenes y pruebas. Se requieren adaptadores públicos de confirmación de Flota y política temporal de Configuration. No se implementa el CRUD general de parámetros ni Audit transversal. Las decisiones propuestas de importes, duplicidad y adjuntos se presentan para aprobación en design.md antes de aplicar.
