# Proposal

## Why

Facturas tiene contratos para política temporal pero su composición sigue devolviendo EDIT_POLICY_UNAVAILABLE. Configuration debe proporcionar un valor funcional administrable y verificable que habilite la edición manual sin plazos embebidos ni cambios en las reglas de autorización.

## What Changes

- Publicar un catálogo cerrado de parámetros funcionales y administrar su consulta, detalle y actualización versionada.
- Introducir invoice.manual-edit-window-seconds, entero positivo de ámbito global, con valor inicial aprobado por el usuario de 43.200 segundos (12 horas).
- Inicializar parámetros mediante operación explícita e idempotente, sin sobrescribir ajustes existentes ni crear valores durante lecturas.
- Restringir administración a APP_ADMIN con parameters:read/update; no ofrecer creación, eliminación ni desactivación desde la API o UI.
- Proporcionar contratos públicos de política efectiva y confirmación transaccional para Facturas, manteniendo el borde exclusivo y efecto sobre facturas existentes.
- Registrar cambios e historial durable, reutilizando los patrones visuales compartidos de Invitaciones y Facturas.

## Capabilities

### New Capabilities

- `configuration`: Catálogo de parámetros funcionales tipados, administración global y resolución confirmable de políticas efectivas.

### Modified Capabilities

Ninguna. Configuration solo existe como delta de initial-invoices-app, no como especificación principal. Invoice Management conserva sus requisitos de política temporal; este cambio implementa el proveedor pendiente sin redefinirlos.

## Impact

Nuevo módulo backend configuration con dominio, aplicación, persistencia y presentación; módulo frontend parameter-management y sustitución del marcador /parameters. Se modifica la composición de Facturas para inyectar el proveedor real y su confirmación dentro de la misma sesión MongoDB. Se documentan inicialización, inventario y rollback. No se almacenan secretos ni se administran perfiles Keycloak, no se crea CRUD genérico ni se implementa Audit transversal. La implementación y su verificación pendiente se registran en `docs/verification.md` y en las tareas OpenSpec.
