# Proposal

## Why

Invoices App ya tiene aplicaciones, servicios y workers, pero aún no dispone de un flujo verificable para publicar imágenes y ejecutarlas de forma segura en el entorno ya elegido: TrueNAS SCALE con Docker Compose. La propuesta concreta ese perfil y la operación inicial sin automatizar el acceso administrativo al NAS.

## What Changes

- Crear imágenes frontend y backend públicas, versionadas por commit, en Docker Hub mediante GitHub Actions tras integrar cambios aprobados en `main`; no publicar imágenes desde pull requests.
- Preparar una Custom App/YAML para TrueNAS SCALE 25.10.2.1, con frontend, API y workers; la primera actualización de imágenes será manual desde TrueNAS.
- Integrar la entrada existente `invoice.oarg.casa` mediante Cloudflare Tunnel y Traefik, exponiendo solo el frontend; conectar frontend, API, workers y dependencias externas a la red Docker compartida `traefik_net`, sin publicar puertos de API o datos en el host.
- Preparar MongoDB para Invoices App con base y usuario propios, autenticación y replica set requerido por las transacciones; hacer respaldo antes de cambiar configuración.
- Definir el uso de Keycloak existente `https://auth.oarg.casa/`, realm `invoices`, preservando el issuer público y usando conectividad privada desde backend cuando esté disponible.
- Establecer controles mínimos de privilegios de contenedores, límites de recursos, sondas y manejo de secretos; documentar publicación, validación, respaldo/restauración y rollback.
- Mantener la semántica actual de `GET /api/health` como liveness; readiness de dependencias será una señal separada.
- No desplegar automáticamente desde GitHub Actions ni almacenar credenciales administrativas del NAS en GitHub.
- No actualizar TrueNAS ni Keycloak como parte de este cambio; validar compatibilidad con TrueNAS 25.10.2.1 y Keycloak 26.4.1.

## Capabilities

### New Capabilities
- `production-runtime`: requisitos de ejecución segura, validación y operación recuperable de los servicios de Invoices App en entornos de producción.

### Modified Capabilities
- Ninguna. Los contratos existentes de desarrollo local, runtime backend, secretos y notificaciones se conservan; el cambio agrega un contrato para operación del conjunto en producción.

## Impact

- Afecta a `frontend`, `backend`, workers, manifiestos Compose, workflows de GitHub Actions, documentación y verificaciones.
- TrueNAS SCALE 25.10.2.1 administra la app con Custom App/YAML; `cloudflared` enruta `invoice.oarg.casa` a Traefik por `https://traefik.oarg.casa/`; Keycloak 26.4.1 usa el realm `invoices` y MongoDB solo será usado por Invoices App.
- Reutiliza controles de `compose.notifications.production.yaml`, manejo de secretos por archivo y sondas existentes. No agrega dependencias de aplicación.
- La retención de respaldos, RPO/RTO y monitoreo específico se documentarán como parámetros operativos pendientes, sin inventar valores.
