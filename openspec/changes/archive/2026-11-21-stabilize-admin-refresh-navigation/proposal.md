# Proposal

## Why

La carga del catálogo de parámetros puede fallar aunque la API responda correctamente, y la actualización silenciosa de permisos no debe volver a disparar consultas de datos sin cambios. Además, si una recarga exige volver a autenticarse, la aplicación debe regresar a la ruta protegida que el usuario estaba consultando.

## What Changes

- Alinear el contrato del frontend con todos los campos del catálogo, incluido `initialValue`.
- Evitar recargas del catálogo cuando la renovación de permisos conserva los mismos permisos efectivos.
- Retener ruta, query y fragmento locales durante el inicio de sesión y restaurarlos al volver del callback OIDC.
- Validar el destino de retorno para impedir redirecciones externas o al callback.
- Corregir el inicializador de parámetros para que sea JavaScript válido al ejecutarse directamente con Node.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `configuration`: el contrato del catálogo incluye el valor inicial y la renovación de permisos no provoca consultas duplicadas cuando su resultado efectivo no cambia.
- `frontend-shell`: una ruta protegida conserva su destino local, query y fragmento al requerir autenticación tras una recarga.

## Impact

Afecta el adaptador y la página frontend de parámetros, el flujo OIDC y su guard de rutas, el script `parameters:init` y las pruebas unitarias asociadas. No cambia endpoints, permisos ni el contrato del proveedor OIDC.
