# Tasks

## 1. Readiness de la API

- [x] 1.1 Añadir una señal separada de `GET /api/health` que compruebe MongoDB y las dependencias de identidad habilitadas para el perfil productivo, con timeout finito y respuesta neutra; verificar con pruebas unitarias los estados preparado/no preparado y que liveness conserva su contrato.
- [x] 1.2 Publicar la señal de readiness en OpenAPI y documentar sus límites en `docs/runtime.md`; verificar `npm --prefix backend run openapi:check` y pruebas HTTP.

## 2. Endurecimiento de la WebApp

- [x] 2.1 Ajustar la imagen de producción Nginx para usuario no root, puerto no privilegiado, filesystem de solo lectura y rutas temporales mínimas; verificar `docker build --target production -f frontend/Dockerfile .` y arranque restringido.
- [ ] 2.2 Configurar cabeceras de seguridad compatibles con la app y orígenes explícitos de API/Keycloak; agregar prueba HTTP de cabeceras y smoke test de navegación/autenticación con CSP habilitada.

## 3. Perfil de referencia de servicios

- [ ] 3.1 Crear la Custom App Compose de producción con frontend, API, workers y dependencias MongoDB/Keycloak externas, sin puertos públicos para backend o datos; hacer que `invoice.oarg.casa` llegue a frontend vía Traefik y verificar `docker compose -f compose.production.yaml config` más prueba de la topología en TrueNAS 25.10.2.1 de forma aislada.
- [ ] 3.2 Crear workflow GitHub Actions que ejecute CI en runners hospedados y publique frontend/backend a Docker Hub solo desde `main` aprobado, con tags por commit, `DOCKERHUB_TOKEN` como secreto y acciones fijadas por SHA; verificar que pull requests no publican y que la descarga anónima en TrueNAS funciona.
- [ ] 3.3 Configurar el procedimiento manual de actualización de tags en Apps → Custom App/YAML y documentar verificación/rollback; comprobarlo con una versión de prueba sin que GitHub Actions contacte la API del NAS.
- [ ] 3.4 Preparar MongoDB para Invoices App: respaldo, base y usuario de mínimo privilegio, autenticación, replica set compatible con la versión instalada y almacenamiento privado; probar conexión autenticada y las operaciones transaccionales antes de habilitar escrituras productivas.
- [ ] 3.5 Documentar configuración de Keycloak `https://auth.oarg.casa/realms/invoices`, issuer público, endpoint privado de JWKS, cliente/orígenes de la WebApp y variables host/container; verificar login y validación de JWT desde el perfil aislado.
- [x] 3.6 Aplicar controles mínimos a contenedores y rutas de escritura, suministrar secretos mediante interfaces `_FILE` y verificar `npm --prefix backend run test:production-secrets` más inspección de la configuración renderizada para asegurar ausencia de valores secretos inline.

## 4. Operación y recuperación

- [x] 4.1 Crear runbook de liberación y actualización manual en TrueNAS, comprobación de señales/logs, respaldo coordinado de MongoDB y almacenamiento de imágenes, simulacro de restauración y rollback de tags; verificar comandos, prerrequisitos, criterios de éxito y punto de reapertura de escrituras mediante revisión del procedimiento.
- [x] 4.2 Añadir un verificador automatizable de configuración productiva que falle ante servicios de desarrollo, puertos de datos públicos, controles de contenedor ausentes o referencias de secretos inline; verificar con fixtures válidos e inválidos.

## 5. Validación integral del perfil

- [x] 5.1 Ejecutar verificaciones de calidad de frontend y backend con `npm --prefix frontend run check`, `npm --prefix backend run check` y `npm --prefix backend run openapi:check`; corregir fallos del cambio.
- [ ] 5.2 Ejecutar build de ambas imágenes, revisar capas/secrets y probar pull público; verificar readiness, cabeceras, ruta Tunnel → Traefik → frontend y proxy `/api` con dependencias efímeras; registrar resultados y limitaciones en `docs/verification.md`.
