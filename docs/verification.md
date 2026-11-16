# Evidencias de verificación

La primera sección conserva el registro histórico de `initialize-foundations`. Las verificaciones del incremento de autenticación se registran por separado al final.

# initialize-foundations (histórico)

## Verificaciones completadas

| Área | Resultado observado |
| --- | --- |
| Frontend | Lint, tipos, 13 pruebas unitarias, grafo de dependencias y casos negativos aprobados. |
| Backend | Lint, tipos, 14 pruebas unitarias, grafo de dependencias y casos negativos aprobados. |
| Reproducibilidad | Frontend reinstalado mediante npm ci offline; ambos Dockerfiles ejecutaron npm ci con lockfiles independientes. Backend fija ESLint 9 para satisfacer los peers de los plugins Next. |
| Compilación | Ambas aplicaciones compilan por separado, sin MongoDB ni Keycloak. Targets Docker development/production compilados para ambas. |
| MongoDB | Una prueba integrada real verifica ping, reutilización, fallo y recuperación sobre una base terminada en _test. |
| HTTP real | Procesos Next standalone aislados verifican salud/no-store, contrato 3.1, documentación y assets, ausencia de login/negocio y 503 sin secretos para entorno inválido. |
| Navegador en host | Cuatro recorridos Chromium aprobados: 360 px, 1280 px, error/reintento y API/Swagger por proxy. Capturas inspeccionadas visualmente. |
| Imágenes finales | Los mismos cuatro recorridos aprobados mediante Nginx en 8180. Backend comprobado con uid/gid 1000 (node). |
| Navegador en Compose | Cuatro recorridos aprobados contra el frontend de desarrollo en 5173 y el backend con Webpack/polling. |
| Configuración pública | Auditoría del bundle sin URI MongoDB, claves Keycloak ni destinos privados de Docker. |
| Compose | Arranque de los tres servicios y consultas health directas/por proxy aprobados, con publicaciones loopback y MongoDB en 27019. |
| Persistencia | Un documento técnico en invoices_foundations_test sobrevivió a docker compose down/up; se verificó y eliminó únicamente ese documento. Se conservaron los volúmenes. |
| Recarga | Vite actualizó la pantalla sin recarga del navegador y Next actualizó el controlador mediante polling en Compose. Los dos archivos de prueba se restauraron. |
| Propuesta base | Los once archivos de initial-invoices-app conservan sus hashes originales; sus tareas no se modificaron. |

## Ajustes y observaciones

- El puerto 27017 pertenece a un servicio previo: se utilizó 27019 para este proyecto sin detener el servicio existente.
- El bind mount Windows no propagó eventos de archivos; Compose usa polling de Vite y Next/Webpack. El host conserva su configuración normal.
- Se corrigió el arranque para usar la salida standalone con assets preparados en postbuild, evitando la advertencia de next start.
- npm informa deprecación de ESLint 9; su versión exacta satisface los peers actuales de eslint-config-next y no se ocultaron conflictos con legacy-peer-deps. Es una dependencia de desarrollo.
- Vite advierte un chunk de unos 501 kB (156 kB gzip); el build termina correctamente. El incremento no define un presupuesto de tamaño.

Las pruebas no acreditan capacidades de negocio, login ni despliegue. Este cambio prepara sus fundamentos y mantiene esas capacidades fuera de alcance. El estado final de tareas y OpenSpec se comprueba antes de presentar el resultado.

## Estado final

OpenSpec confirma `all_done`: 24/24 tareas completadas. La validación estricta de `initialize-foundations` terminó sin errores ni advertencias. Se retiraron los tres contenedores temporales de pruebas y su red; permanecen activos únicamente los tres servicios Compose del proyecto y los servicios ajenos no se alteraron. La WebApp y la API responden correctamente en 5173 y 3000.

# implement-authentication — 2026-11-09

## Comprobaciones completadas

| Área | Resultado observado |
| --- | --- |
| Frontend | Lint y tipos aprobados mediante `npm --prefix frontend run check`. Verificación final: 41 pruebas aprobadas mediante `npm --prefix frontend test -- --maxWorkers=1` y reglas de arquitectura, incluidos casos negativos, mediante `npm --prefix frontend run test:architecture`. |
| Backend | `npm --prefix backend run check`: lint, tipos, 50 pruebas y reglas de arquitectura, incluidos casos negativos, aprobados. |
| Build | Ambas aplicaciones compilan por separado. El backend publica `/api/auth/me` con runtime Node.js. Los builds no requieren conexión a MongoDB ni Keycloak. |
| Contrato | `npm --prefix backend run openapi:lint` aprobado; respuestas reales 200/401 de `/me` contrastadas con sus esquemas. |
| HTTP standalone | Health/no-store, documentación pública, assets locales, contrato y errores de configuración comprobados con MongoDB inaccesible. |
| JWT/JWKS | Firma/algoritmo, issuer, audiencia, expiración, subject, tipo de token, roles, caché, rotación, timeout y recuperación comprobados con claves efímeras y servidor JWKS local. |
| Keycloak | Importación aislada, flujos prohibidos, redirects, PKCE S256 y persistencia tras reinicio comprobados. El scope `basic` emite `sub`; el backend rechaza correctamente su ausencia. |
| Dependencias | `npm ci` completado en ambas aplicaciones; imágenes de desarrollo construidas con lockfiles y volúmenes existentes de dependencias actualizados. |
| Bundle público | Sin credencial de bootstrap, URI MongoDB ni dirección interna `http://keycloak:8080`. Los archivos de entorno locales están ignorados y excluidos de los contextos Docker. |
| Desarrollo local | WebApp 5173, API 3000, Keycloak 8181 y MongoDB 27019. Health/Swagger devuelven 200, `/me` sin Bearer devuelve 401 por acceso directo y proxy. Realm, issuer y scope `basic` verificados; no se crearon usuarios permanentes. |

## Aceptación integrada

`node scripts/test-authentication.mjs --mode=host` terminó correctamente. Verificó los diez pasos OIDC/API, issuer/audience/subject, rechazo de ID/Refresh Token y firma alterada, UI 360/1280 px, health con error/reintento, ruta desconocida, recarga SSO y renovación automática. También pasó Swagger directo/proxy con 200/401 y limpieza al recargar, logout y nuevo login, refresh rechazado, caída/recuperación de Keycloak con JWKS en caché, documentación pública durante la caída, callback cancelado, nonce incorrecto sin llamada protegida y error 503 con reintento de `/me`. No se persistieron tokens en almacenamiento del navegador ni se crearon bases IndexedDB. El fixture retiró su realm, usuario y contenedor temporales.

`node scripts/test-authentication.mjs --mode=compose` también terminó correctamente con los mismos recorridos, incluido fallo/recuperación del proveedor y nonce alterado. Comprobó el issuer público con JWKS por red interna y persistencia de Keycloak tras reinicio. El fixture retiró su realm, usuarios, contenedores, red y volúmenes temporales; conservó los servicios y datos del entorno local.

## Ajustes observados

- El puerto 8080 estaba ocupado por un servicio ajeno; se configuró 8181 sin detener ese servicio.
- Al importar scopes explícitos, Keycloak necesita el mapper `oidc-sub-mapper` en el scope predeterminado `basic`. Se corrigió la importación y se añadió su comprobación al fixture; se mantuvo obligatoria la validación de subject en la API.
- Swagger 5.34.1 expone el botón de aplicar autorización como `Apply credentials`; la automatización usa esa etiqueta accesible.
- Windows bloqueó una caché generada `.next/dev` durante un nuevo arranque. Se retiró exclusivamente esa caché con Next detenido. No se borraron volúmenes de datos.
- El bundle frontend ronda 544 kB sin comprimir (170 kB gzip); Vite advierte el umbral de 500 kB y el build termina correctamente.
- El último `check` encontró un timeout al iniciar workers de Vitest. La repetición con un solo worker ejecutó los cinco archivos y aprobó las 41 pruebas, incluida la limpieza del callback cuando falta configuración OIDC. La comprobación de arquitectura se completó por separado.

La autenticación no introduce CRUD, contraseñas en MongoDB ni autorización organizacional. Las tareas de `initial-invoices-app` no se modificaron. Este registro no acredita un despliegue productivo.

## Estado final del incremento

OpenSpec confirma `all_done`: 27/27 tareas completadas. La validación estricta de `implement-authentication` terminó correctamente. El cambio queda disponible para revisión previa a su sincronización y archivo. Los cuatro servicios locales permanecen activos; las pruebas eliminaron sus recursos temporales sin alterar servicios ajenos ni volúmenes de datos locales.
