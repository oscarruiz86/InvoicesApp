# Proposal

## Why

El guardado de la matriz ya requiere confirmación, pero hoy la confirmación se muestra en línea, el progreso es solo texto y el aviso de éxito no identifica la versión que devolvió el servicio. Un flujo coherente debe guiar la confirmación y comunicar el resultado real sin perder el rol que la persona estaba administrando.

## What Changes

- Presentar la confirmación del reemplazo de la matriz en un modal propio, con la versión vigente y acciones claras para confirmar o cancelar.
- Mostrar durante el envío una animación accesible basada en los patrones de carga ya usados por la aplicación, y evitar envíos repetidos.
- Al terminar el servicio, mostrar su resultado confirmado: la versión devuelta en caso de éxito, o el error seguro correspondiente sin descartar el borrador.
- Conservar la pestaña del rol seleccionado tras la respuesta, tanto en éxito como en error o recarga.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- role-management: formalizar la confirmación modal, la carga, la presentación del resultado del servicio y la continuidad del rol seleccionado durante el guardado.

## Impact

Frontend de role-management, pruebas unitarias y E2E, y la especificación OpenSpec role-management. No requiere cambios en el contrato HTTP, la política del backend ni Keycloak.
