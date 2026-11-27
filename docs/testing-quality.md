# Guía de selección de verificaciones

Esta guía relaciona el riesgo tocado con los comandos disponibles. Las aplicaciones se instalan y verifican por separado; no hay un `package.json` orquestador en la raíz. Desde la raíz del repositorio, los comandos siguientes usan `npm --prefix <aplicación> run <script>`.

## Niveles y comandos

| Aplicación / capa | Comando | Configuración y alcance | Dependencias y exclusiones |
| --- | --- | --- | --- |
| Backend, check local | `npm --prefix backend run check` | `backend/package.json`: lint, TypeScript, Vitest unitario (`backend/vitest.config.ts`) y arquitectura con fixtures negativos temporales. | No requiere MongoDB ni Keycloak. No ejecuta integración, HTTP, OpenAPI ni build. |
| Frontend, check local | `npm --prefix frontend run check` | `frontend/package.json`: lint, TypeScript, Vitest en jsdom (`frontend/vitest.config.ts`) y arquitectura con fixtures negativos temporales. | No requiere servicios externos. No ejecuta Playwright ni build. |
| Backend, integración | `npm --prefix backend run test:integration -- tests/integration/<archivo>.test.ts` | `vitest.integration.config.ts`; incluye `tests/integration/**/*.test.ts`. Seleccionar archivos pertinentes. | Requiere `MONGODB_TEST_URI` hacia MongoDB replica set; suites Keycloak opcionales dependen de variables de fixture y pueden quedar omitidas. El comando directo no prepara servicios. |
| Backend, integración preparada | `npm --prefix backend run test:integration:prepared -- tests/integration/<archivo>.test.ts` | Orquestador `scripts/test-vehicle-management-integration.mjs`; inicia MongoDB y Keycloak descartables, inyecta configuración temporal y los retira. Sin filtro ejecuta la suite completa. | Requiere Docker. Los contenedores y datos son efímeros; no usa el `.env` del backend para configurar estos servicios. |
| Backend, HTTP | `npm --prefix backend run test:http` | Scripts `backend/scripts/test-http.mjs` y `test-vehicles-http.mjs`; pruebas de superficie HTTP. | Puede usar servicios/preparación según el escenario. No equivale a OpenAPI ni a Playwright. |
| Backend, HTTP preparada | `npm --prefix backend run test:http:prepared` | Orquestador `scripts/test-vehicle-management-http.mjs`; MongoDB descartable para el harness HTTP. | Requiere Docker; limpia el contenedor que inicia. |
| Backend, OpenAPI | `npm --prefix backend run openapi:check` | Ejecuta Redocly lint y cotejo de rutas implementadas frente a `backend/openapi/openapi.json`. | No inicia servidor ni valida respuestas HTTP reales. |
| Backend, build | `npm --prefix backend run build` | Next build; incluye preparación de Swagger y standalone mediante lifecycle scripts. | No requiere MongoDB ni Keycloak. No ejecuta E2E. |
| Frontend, build | `npm --prefix frontend run build` | TypeScript y Vite build. | No requiere servicios externos. No ejecuta E2E. |
| Frontend, E2E | `npm --prefix frontend run test:e2e` | Playwright Chromium con `frontend/playwright.config.ts`; inicia Vite salvo que se indique `E2E_BASE_URL`. | Requiere Chromium instalado y la aplicación adecuada. No prepara por sí solo backend/Keycloak. |
| Frontend, E2E preparada | `npm --prefix frontend run test:e2e:prepared` | `scripts/test-vehicle-management-e2e.mjs`; inicia servidores aislados, usa Mongo URI inaccesible para flujos que no requieren BD y limpia procesos/archivos temporales propios. | Requiere builds existentes de backend/frontend y navegador Playwright. |
| Frontend, E2E offline-shell | `npm --prefix frontend run test:e2e:offline-shell` | Config específico offline; ejecuta build offline-shell y preview, y `globalTeardown` retira `frontend/test-results/offline-shell-e2e-key.json`. | Requiere Chromium. Crea artefacto local bajo `test-results`; no borrar otros resultados ni archivos del usuario. |

`check` en ambas aplicaciones ejecuta únicamente lint, tipos, unitarias y arquitectura. No incluye integración, HTTP, OpenAPI, build ni E2E.

## Elegir suites por riesgo

| Cambio o riesgo | Evidencia focal mínima recomendada | Añadir cuando aplique |
| --- | --- | --- |
| Regla de dominio o caso de uso aislado | Unitarias de la aplicación afectada y su `check`. | Casos de error, límites, concurrencia o idempotencia definidos por la capacidad. |
| Autorización, permisos, contexto o separación entre organizaciones | Unitarias de políticas/contexto y `check` backend; frontend si cambia su presentación. | Integración Mongo para persistencia/revocación; HTTP/OpenAPI si cambia una ruta; E2E si cambia el recorrido del usuario. |
| Repositorio, transacción, migración, outbox o retención | Suite de integración Mongo pertinente con replica set y base `_test`. | HTTP si se expone en API; no usar inventarios o migraciones operativas como prueba rutinaria. |
| Proveedor externo (Keycloak, SMTP u otro) | Prueba focal que use fixture/configuración temporal del proveedor cuando el comportamiento dependa de este. | Registrar como omitida con motivo si faltan servicios/secretos efímeros; dobles no demuestran integración real. |
| Route Handler, códigos/envelopes HTTP o `no-store` | Pruebas del handler y `test:http` preparado según la superficie afectada. | `openapi:check` ante cambios de contrato; build backend si se altera composición/runtime. |
| OpenAPI, rutas o esquemas públicos | `openapi:check`. | `test:http` para respuestas reales; la validación del documento no las sustituye. |
| Interfaz, navegación, accesibilidad o responsive | Unitarias/componentes frontend y `check`. | Playwright focal ante recorridos, teclado, viewport o integración entre aplicaciones. |
| Integración transversal backend/frontend | Checks de ambas aplicaciones y contrato que conecta sus responsabilidades. | HTTP/OpenAPI y E2E según el recorrido afectado. |
| Límites arquitectónicos o dependencias | `check` de cada aplicación afectada (incluye fixtures negativos de arquitectura). | No hace falta una suite de otra capa si no hay dependencia concreta. |

Las capacidades de negocio existentes mantienen sus criterios específicos en `openspec/specs/` y cambios archivados. Esta matriz decide el nivel según la superficie realmente tocada; no exige ejecutar todas las capas en cada cambio.

## Aislamiento y limpieza

- Para transacciones MongoDB, usar un replica set de pruebas. `compose.test-mongodb.yaml` publica el puerto en loopback, usa almacenamiento temporal y acepta `MONGO_TEST_PORT` (por defecto `27019`). El fixture de integración preparada crea un contenedor con nombre aleatorio y URI a una base `company_fixture_test`.
- Las suites deben derivar nombres únicos terminados en `_test`, validar el nombre antes de `dropDatabase()` y cerrar su conexión. Nunca apuntar `MONGODB_TEST_URI` a una base local persistente, productiva o configurada desde `.env`/`.env.local`.
- Los fixtures Keycloak de `scripts/auth-fixture.mjs` limitan origins a `localhost`/`127.0.0.1`, crean realms, usuarios y secretos aleatorios, y eliminan solo sus recursos. Usar credenciales temporales de un Keycloak de prueba; no copiar secretos del entorno operativo.
- Playwright debe usar servidores y perfiles temporales. Los orquestadores preparados limpian únicamente procesos, contenedores, realms, volúmenes o directorios temporales que crearon. La prueba offline-shell posee solo el archivo de clave nombrado en su config/teardown.
- No ejecutar `compose down -v`, resets, migraciones, inventarios, borrados amplios o limpieza manual sobre el entorno local. No compartir ni inspeccionar valores de `.env`, `.env.local` o archivos secretos en los informes.

## CI y cobertura

En el inventario de este cambio no se detectaron workflows/configuración de proveedor CI ni scripts o dependencias de cobertura. La selección del proveedor, pipeline y gates queda para una propuesta posterior. No se establece umbral numérico.

## Revisión de consistencia

Los comandos de esta guía se cotejaron con ambos `package.json`, las configuraciones Vitest/Playwright y los orquestadores/fixtures citados. No se encontraron scripts inexistentes. Se aclaró que `test:e2e:prepared` requiere builds previamente disponibles y que el config offline-shell crea y limpia su propio archivo de clave bajo `frontend/test-results`. Al insertar el índice de `docs/verification.md`, se retiró un encabezado duplicado de `initialize-foundations`; sus registros y resultados permanecen intactos. La revisión fue estática: no inició servicios ni ejecutó suites o builds.
