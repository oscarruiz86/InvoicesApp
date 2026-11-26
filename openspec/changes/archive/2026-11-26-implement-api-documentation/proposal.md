# Proposal

## Why

El backend ya publica Swagger UI y un documento OpenAPI 3.1, pero el contrato es mantenido como JSON separado de handlers y validadores Zod, por lo que puede quedar desactualizado al evolucionar rutas. Se necesita un proceso verificable que cubra los contratos reales, explicite brechas y proteja la frontera entre documentación y cambios funcionales.

## What Changes

- Establecer requisitos para mantener y validar OpenAPI 3.1 alineado con los Route Handlers y contratos HTTP existentes.
- Definir una estrategia incremental de coherencia con Zod/DTOs y un control que detecte rutas públicas no documentadas.
- Especificar la clasificación de seguridad por operación, incluyendo Bearer JWT, permisos ya existentes y rutas técnicas públicas, sin derivar permisos a partir de nombres de roles.
- Aclarar publicación de `/api/openapi` y `/api/docs` por entorno según el mecanismo de Swagger local ya instalado, sin exponer secretos ni añadir endpoints de negocio.
- Registrar contratos ambiguos o respuestas propias de módulos como brechas para resolver antes de documentarlos, sin inventar comportamiento.

## Capabilities

### New Capabilities

- `api-documentation`: Contrato OpenAPI, su consistencia verificable con la API implementada y su publicación segura.

### Modified Capabilities

- Ninguna. Los requisitos existentes de `backend-runtime` ya establecen OpenAPI 3.1 y Swagger accesibles; esta propuesta añade criterios de cobertura y mantenimiento sin cambiar ese comportamiento runtime.

## Impact

- Artefactos: `backend/openapi/openapi.json`, `backend/redocly.yaml`, `backend/scripts/prepare-swagger.mjs` y `backend/package.json`.
- Entradas de referencia: Route Handlers en `backend/src/app/api`, validadores/presentación, `backend/src/shared/presentation/http/errors.ts`, configuración Keycloak y specs existentes de backend e identidad.
- Superficies publicadas existentes: `GET /api/openapi`, `GET /api/docs`, `GET /api/health` y operaciones actualmente implementadas. No se agregan rutas, contratos funcionales ni dependencias en esta etapa.
