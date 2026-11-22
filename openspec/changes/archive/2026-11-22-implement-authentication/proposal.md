# Proposal

## Why

Invoices App ya cuenta con frontend React y API Next.js independientes, pero todavía no puede identificar usuarios ni proteger solicitudes. Este incremento integra Keycloak mediante OIDC y OAuth 2.0 para validar una sesión completa antes de desarrollar los módulos de negocio, conservando SOLID, DDD y Clean Architecture.

## What Changes

- Definir el realm de desarrollo `invoices`, cliente público `invoices-web`, Authorization Code Flow con PKCE S256, URLs permitidas y audiencia de API `invoices-api` explícita en el Access Token.
- Crear los roles iniciales `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`, sin asignar privilegios por defecto ni implementar autorización organizacional.
- Integrar login y logout delegados a Keycloak, estado Zustand, rutas privadas, renovación de tokens en memoria y transporte Bearer protegido.
- Implementar verificación JWT mediante JWKS, firma, issuer, audience y expiración detrás del puerto existente de identidad; añadir `GET /api/auth/me` con información mínima del usuario y respuesta 401 ante credenciales inválidas.
- Extender OpenAPI/Swagger con Bearer JWT, respuestas verificables y pruebas autenticadas de desarrollo.
- Añadir configuración local reproducible, ejemplos de entorno sin secretos y pruebas unitarias, de contrato y del flujo real de navegador.
- Sustituir expresamente las restricciones de foundations que mantienen inactiva la integración Keycloak. Los endpoints técnicos públicos y los builds sin servicios externos conservan su comportamiento.

## Capabilities

### New Capabilities

- `identity-access`: configuración de identidad OIDC, validación independiente del proveedor, actor interno, roles generales y contrato protegido de sesión. Reutiliza el nombre previsto en `initial-invoices-app`; todavía no existe una especificación principal de esta capacidad.

### Modified Capabilities

- `frontend-shell`: configuración OIDC pública, navegación autenticada, estado de sesión, renovación y comunicación protegida.
- `backend-runtime`: activar el adaptador de identidad, incorporar `/api/auth/me` al inventario y extender Swagger sin proteger health ni servir páginas de login.
- `local-development`: incorporar Keycloak y sus variables, direccionamiento host/Compose, verificación de autenticación y aprobación acotada a este incremento.

## Impact

La implementación futura afectará `frontend/src/modules/authentication`, composición en `frontend/src/app`, transporte HTTP y configuración; `backend/src/modules/identity`, composición en `backend/src/bootstrap`, Route Handlers, errores HTTP y `backend/openapi/openapi.json`; además de Compose, ejemplos de entorno, documentación y pruebas. Se propone `keycloak-js` en infraestructura frontend y `jose` en infraestructura backend; sus versiones exactas y la imagen Keycloak se fijarán al implementar, conservando lockfiles separados.

Esta entrega solo crea artefactos en `openspec/changes/implement-authentication`. No implementa código, instala dependencias, cambia entornos reales, sincroniza specs principales ni modifica las tareas de `initial-invoices-app`. La aprobación posterior se limitará a autenticación: quedan fuera CRUD de empresas, terceros, facturas y flota, autorización organizacional completa, contraseñas en MongoDB, login propio con contraseñas y despliegues.
