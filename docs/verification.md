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

## Gestión de terceros — verificación del 2026-11-18

Se implementó el perfil administrativo canónico, su proyección `Organization`, relaciones empresa-tercero many-to-many, auditoría transaccional, rutas REST y OpenAPI, inventario legado idempotente, selector compartido por invitaciones/memberships y pantallas administrativas responsive. El perfil personal de Keycloak permanece fuera de las escrituras del módulo.

| Verificación | Resultado |
| --- | --- |
| `npm run check` en backend | Correcto: lint sin errores, TypeScript, 352 pruebas unitarias y comprobación arquitectónica. ESLint conserva advertencias en scripts y una suite existente. |
| Frontend | Lint sin errores, typecheck, 135 pruebas Vitest y comprobación arquitectónica correctos. ESLint conserva 11 advertencias de React Hooks en pantallas existentes. |
| OpenAPI | `npm run openapi:lint` válido. Pruebas HTTP de controladores verifican envelopes JSON/no-store para permisos, errores y scopes. |
| Build | `npm run build` de backend (incluido standalone) y frontend correctos; Vite advierte que el chunk principal de 896.73 kB supera el umbral de 500 kB (265.50 kB gzip). |
| HTTP standalone | `npm run test:http` aprobado con MongoDB inaccesible y valores efímeros: salud, contrato OpenAPI 3.1, Swagger/assets, respuestas 503 de runtime no configurado y 401/no-store de endpoints anónimos con JWKS local. |
| MongoDB | La integración específica de terceros aprobó 9 pruebas transaccionales con `MONGODB_TEST_URI` y conexión local `replicaSet=invoices-rs&directConnection=true`: rollback de escrituras, barreras de revocación, alcance por empresa y auditoría append-only. |
| Frontend terceros | 13 pruebas unitarias focalizadas verifican adaptador/errores, búsqueda y contexto, conflicto de versión, navegación, permisos y limpieza del formulario. |
| Integración ampliada | 20 pruebas pasaron y una suite externa de Keycloak se excluyó porque no están configuradas sus credenciales efímeras. `company-management.test.ts` mantiene 2 fallos reproducibles en aislamiento: espera eventos de empresa que no se almacenaron y esperaba `FORBIDDEN` mientras recibió `COMPANY_VERSION_CONFLICT`. |
| Navegador | `npm run test:e2e -- --workers=1`: 15/15 pruebas correctas contra un servidor Vite aislado, incluidos 360 px, 1280 px, teclado, creación/edición, relaciones y membreships. |

La suite ampliada de integración no queda completamente verde por los dos fallos descritos en `company-management.test.ts`; los flujos de terceros, invitaciones y contexto incluidos en esa ejecución pasaron. La prueba del directorio de Keycloak requiere un issuer, cliente y sujeto efímeros no provistos en esta ejecución. El E2E de creación ahora espera explícitamente el encabezado de la ruta antes de localizar NIT, para no confundirlo con el campo de búsqueda de la lista durante la navegación asíncrona. El comando de inventario legado se probó con fixtures en una base aleatoria `_test`; no se ejecutó contra `.env.local` ni sobre datos operativos, por lo que no se declara un conteo de terceros legados pendientes de conciliación. No se desplegó el cambio.


## Cierre OpenSpec — implement-third-party-management (2026-11-18)

- Las 32 tareas del cambio estaban marcadas completas y 0 pendientes. openspec validate implement-third-party-management --strict --no-interactive pasó antes del archivo.
- openspec archive -y implement-third-party-management sincronizó 11 requisitos nuevos en application-template, third-party-management y user-invitations, y archivó el cambio en openspec/changes/archive/2026-11-18-implement-third-party-management.
- openspec validate --archived --strict --no-interactive pasó para los 7 cambios archivados. La nueva spec third-party-management valida en modo estricto.
- La validación estricta completa de user-invitations y application-template aún señala advertencias de longitud en requisitos anteriores a estas adiciones. Las deltas nuevas están sincronizadas y la gestión de terceros no tiene advertencias.
- No se desplegó el cambio. La revisión y el PR hacia development siguen siendo el paso de integración después del commit local.

## implement-role-management — 2026-11-19

| Verificación | Resultado |
| --- | --- |
| Backend | `npm run check` aprobado: lint, TypeScript, 357 pruebas unitarias y comprobación arquitectónica. ESLint terminó con 4 advertencias y 0 errores. |
| Frontend estático | `npm run lint` aprobado con 0 errores y 11 advertencias existentes; `npm run typecheck` y `npm run test:architecture` aprobados. |
| OpenSpec | Validación estricta aprobada con 21/21 tareas completas. Las especificaciones canónicas ya contienen los requisitos; `skip_specs: true` evitó duplicarlos. La propuesta quedó archivada como `openspec/changes/archive/2026-11-19-implement-role-management`. |
| Suite frontend completa | `npm test -- --maxWorkers=1 --reporter=verbose`: 25 archivos y 145 pruebas aprobadas. Se actualizaron expectativas obsoletas de filtros, confirmación y acciones para reflejar la interfaz vigente. La tarea 5.1 quedó completa. |
| Build y OpenAPI | `npm run build` backend y `npm run openapi:lint` aprobados. |
| HTTP standalone | `npm run test:http` aprobado con Next compilado: contrato OpenAPI 3.1, Swagger y assets, JWT efímero, 401/400/no-store en `/api/roles`, errores de configuración y respuestas de autorización. |
| MongoDB | 1 prueba de política/auditoría y 9 pruebas de revalidación transaccional pasaron contra MongoDB replica set y base de prueba terminada en `_test`. La base aleatoria se eliminó; el contenedor temporal se detuvo. |
| Navegador | 5/5 pruebas de `/roles` aprobadas con Vite aislado: matriz de un solo rol, 360 px, 1280 px, teclado, continuidad, conflicto/recarga, invalidación de navegación y guardia de contexto. Vite temporal en 5174 se detuvo. |

La política conserva `APP_ADMIN / roles:read / global` y `APP_ADMIN / roles:manage / global`. El límite de auditoría sigue siendo 1000 eventos pendientes y la actualización falla cerrada al agotarse. No se modificaron roles, perfiles, asociaciones ni credenciales de Keycloak. La recuperación cuando no existe ningún APP_ADMIN asignado queda a cargo del procedimiento operativo de identidad del entorno. No se desplegó ni se abrió un PR; queda revisión antes de integrar a `development`.

## implement-invoice-qr-scanning — 2026-11-22

| Verificación | Resultado |
| --- | --- |
| Backend | `npm --prefix backend run check` aprobado: lint sin errores (9 advertencias), TypeScript, 467 pruebas y comprobación arquitectónica. `npm --prefix backend run build` aprobado. |
| Frontend | ESLint sin errores (13 advertencias preexistentes), TypeScript, 221 pruebas Vitest con `--maxWorkers=1` y comprobación arquitectónica aprobados. |
| Build frontend | Vite aprobado. Adaptador diferido: 16.78 kB (5.94 kB gzip); worker local: 43.95 kB (10.37 kB gzip); chunk principal: 1,035.25 kB (297.77 kB gzip), con aviso del umbral de 500 kB. |
| OpenAPI | `npm --prefix backend run openapi:lint` válido; endpoints de preview y alta QR incluidos en el build backend. |
| MongoDB | 10 pruebas de `invoice-repository.test.ts` aprobadas contra replica set local y URI aislada `_test`: idempotencia, CUFE y duplicidad entre orígenes, cierre/revocación concurrentes y rollback de auditoría. |
| Navegador | Evidencia previa: 4/4 pruebas Playwright aprobadas con cámara simulada: registro QR en 360/1280 px y flujo de Facturas/teclado. La prueba UI confirma permisos/errores, lectura única, preview bloqueado, asignación, adjunto separado, cancelación, contexto obsoleto y reintento idempotente. |
| Build/import | Reejecutado en el workspace: `npm --prefix frontend run build` aprobado. Vite resolvió `qr-scanner` y empaquetó el adaptador y worker local. La causa más probable de la captura es un `node_modules` de desarrollo desactualizado: Compose conserva ese directorio en el volumen nombrado `frontend-modules`, que no se refresca al reconstruir la imagen. El arranque de desarrollo ahora compara el hash de `package-lock.json` y ejecuta `npm ci` cuando el volumen quedó obsoleto. |
| Playwright en este entorno | No reproducible en esta sesión: el puerto 5173 ya estaba ocupado y el Chromium requerido por Playwright no está instalado en la caché configurada (`chromium_headless_shell-1254`). No se atribuye esta ejecución fallida como evidencia de pruebas aprobadas; se conserva la evidencia previa indicada arriba. |
| Formato y alta DIAN | El preview acepta delimitadores `:` y `=`, URL separada y valores ValFac/ValIva/ValOtroIm que no suman exactamente ValTolFac. El POST de alta devolvía `INVALID_REQUEST` porque la fábrica QR reutilizaba la restricción aritmética exclusiva de MANUAL. La fábrica QR ahora conserva el total pagadero y la validación MANUAL sigue exigiendo igualdad. `npm test -- tests/unit/invoice-domain.test.ts tests/unit/invoice-qr-parser.test.ts tests/unit/invoices-application.test.ts tests/unit/invoice-presentation.test.ts --maxWorkers=1`: 25/25 pruebas aprobadas; TypeScript aprobado. |
| OpenSpec | `openspec validate implement-invoice-qr-scanning --strict` válido. |

Las pruebas del navegador no acreditan acceso a una cámara física. La tarea 5.3 queda pendiente hasta comprobar un dispositivo real en HTTPS con permiso de cámara concedido y denegado, registrando navegador y dispositivo. No se atribuye a la simulación evidencia de cámara real. No se desplegó el cambio.

## improve-role-management-save-feedback — 2026-11-19

| Verificación | Resultado |
| --- | --- |
| Interfaz de confirmación | Modal accesible aprobado en 10 pruebas unitarias de Roles: muestra la versión vigente, cancelar conserva el borrador y no envía la solicitud. Durante envío muestra CircularProgress con estado accesible y bloquea cierre y solicitudes duplicadas. |
| Resultado y selección | Éxito muestra la versión devuelta por el servicio. Conflicto 409 y capacidad de auditoría 503 preservan borrador y pestaña, y exigen recarga antes de reintentar. Las pruebas validan que la pestaña seleccionada permanece tras éxito, error y recarga. |
| Frontend estático | `npm run lint` sin errores (11 advertencias preexistentes de React Hooks); `npm run typecheck` aprobado. |
| Suite frontend completa | `npm test -- --maxWorkers=1 --reporter=verbose`: 25 archivos y 147 pruebas aprobadas. |
| Arquitectura | `npm run test:architecture` aprobado; chequeos negativos de frameworks, alias/reexport y ciclos aprobados. |
| Navegador | E2E Roles: 5/5 pruebas aprobadas, incluidos modal, cancelación, progreso, respuesta y pestaña persistente, teclado, 360 px y 1280 px. Conflicto concurrente e invalidación de navegación también aprobados. |

OpenSpec archivó la propuesta como `openspec/changes/archive/2026-11-19-improve-role-management-save-feedback` y sincronizó un requisito nuevo en `openspec/specs/role-management/spec.md`. `openspec validate --archived --strict --no-interactive` aprobó los 9 cambios archivados. No se desplegó ni se abrió un PR.

## implement-driver-management — 2026-11-19

| Verificación | Resultado |
| --- | --- |
| Backend `npm --prefix backend run check` | Correcto: ESLint sin errores (6 advertencias), TypeScript, 387 pruebas unitarias y comprobación arquitectónica. El inventario HTTP ahora exige Bearer, scope y permisos para todas las rutas DRIVER. |
| Integración MongoDB focal | 20/20 pruebas correctas contra un replica set local aislado (`127.0.0.1:27018`, base terminada en `_test`): gestión y elegibilidad DRIVER, migración, aceptación de invitaciones, cambios de roles y concurrencia de memberships. |
| Integración ampliada | 39 pruebas pasaron, 2 fallaron y 1 se omitió con la fixture Keycloak externa excluida. Los dos fallos conocidos de `company-management.test.ts` esperan un evento de auditoría de una operación permitida que no se emite por ese puerto, y esperan `FORBIDDEN` donde la escritura concurrente devuelve `COMPANY_VERSION_CONFLICT`. La suite de directorio Keycloak requiere issuer, cliente, secreto y sujeto efímeros que no estaban configurados. |
| HTTP standalone `npm --prefix backend run test:http` | Correcto en el modo sin `AUTHORIZATION_TEST_MONGODB_URI`: Next real, JWT/JWKS efímeros, OpenAPI/Swagger/assets locales, 401/400/no-store, runtime inválido y autorización no disponible devuelven los resultados esperados. Una ejecución exploratoria con una base vacía devolvió 403 porque no había grants sembrados; no se usó como resultado final. |
| OpenAPI | `npm --prefix backend run openapi:lint` aprobado. |
| Frontend `npm --prefix frontend run check` | Correcto: lint sin errores (11 advertencias React Hooks), TypeScript, 161/161 pruebas unitarias y arquitectura. El timeout unitario quedó en 10 segundos para las interacciones MUI en el runner Windows. |
| Navegador `npm --prefix frontend run test:e2e -- --workers=1` | 25/25 pruebas aprobadas, incluidos THIRD_PARTY_ADMIN/DRIVER, rutas neutrales, invitaciones por enlace y “Mis invitaciones”, identidad de solo lectura, estado, teclado y responsive a 360/1280 px. La corrida serial evita la contención observada en los tests con Vite. |
| Cambios OpenSpec activos | `implement-authorization` (24/32) e `implement-organization-context` (39/41) siguen activos. Esta propuesta usa sus contratos actuales; sus tareas pendientes no se marcan como completadas aquí. |

La identidad de Driver es una proyección nullable y de solo lectura; aceptar una invitación `DRIVER` o agregar ese rol aprovisiona el registro. No existe un formulario paralelo ni edición del perfil Keycloak. Antes de migrar datos de un entorno funcional, ejecuta `npm --prefix backend run drivers:inventory`, revisa conflictos y recién entonces `npm --prefix backend run drivers:migrate`; la migración une únicamente por `membershipId`, exige membership y tercero activos, y es idempotente. En esta verificación se usaron fixtures `_test`; no se migraron datos operativos.

Esta entrega no define licencia, teléfono, dirección ni otros campos operativos. No implementa vehículos, asignaciones ni facturas, tampoco modifica Keycloak ni declara entrega transversal de Audit. Los dos fallos de integración de `company-management` y la fixture Keycloak externa quedan visibles y no se atribuyen al flujo DRIVER. La propuesta permanece abierta para revisión; no se hizo commit, push, merge, despliegue ni PR.

### Cierre y ajustes finales — 2026-11-19

Se completó la alineación visual de Conductores con el patrón de Empresas: toolbar con filtros y asociación, chips de filtros activos, tabla responsive con ordenamiento, columna de correo electrónico, identificación en formato `TIPO · NÚMERO`, paginación y acciones de ver/activar/desactivar. En móvil, las acciones de cada tarjeta ocupan el ancho disponible para evitar botones estrechos o desbordados. El filtro admite nombre, correo electrónico y número de documento. La asociación de conductor abre un modal local y permanece en `/drivers`; no redirige a Invitaciones. La opción Invitaciones está visible para el rol de administrador de tercero.

| Verificación de cierre | Resultado |
| --- | --- |
| `npm run typecheck` en `frontend` | Aprobado. |
| `npm run test -- tests/unit/fleet-resource-page.test.tsx --run` en `frontend` | 9/9 pruebas aprobadas, incluidos filtros, asociación, conflicto de versión y acciones responsive. |
| `npm run lint` en `frontend` | Aprobado sin errores; permanecen únicamente advertencias React Hooks preexistentes. |
| `git diff --check` | Aprobado; solo reporta avisos de conversión CRLF del árbol existente. |
| OpenSpec | `openspec validate implement-driver-management --strict --no-interactive` aprobado; 19/19 tareas completas. |

La integración MongoDB no se repitió durante este cierre porque la sesión no tenía `MONGODB_TEST_URI`; las ejecuciones focales con replica set y base terminada en `_test` quedan documentadas arriba. No se migraron datos operativos, ni se hizo commit, push, merge, despliegue o PR.

## Vehículos — verificación completada el 20 de noviembre de 2026

Cambio `implement-vehicle-management`, implementado en `openspec/implement-vehicle-management` desde `development` (base `480f3ce`). Se completaron dominio, persistencia e historial transaccionales, inventario de solo lectura, REST/OpenAPI, pantalla Fleet y verificación de regresión. No se añadieron dependencias de aplicación ni grants.

| Comprobación | Resultado |
| --- | --- |
| `npm --prefix backend run check` | Aprobado: lint, typecheck, 404 pruebas unitarias en 36 archivos y arquitectura con comprobaciones negativas. Quedan advertencias de lint existentes, sin errores. |
| `npm --prefix backend run test:integration:prepared` | Aprobado: ejecuta `test:integration` con MongoDB y Keycloak efímeros reales; 51/51 pruebas, 13/13 archivos, sin omisiones. Incluye los 8 casos transaccionales de Vehículos y la retención de notificaciones, ahora habilitada en la fixture aislada. |
| `npm --prefix backend run test:http:prepared` | Aprobado: ejecuta `test:http` sobre el standalone preparado y MongoDB temporal. Verifica Next/OpenAPI/Swagger, JWT y errores de configuración; Vehículos usa JWT firmado, JWKS HTTPS con CA efímera y bases `vehicle_http_*_test`. Alta 201/Location, normalización, cuerpos/parámetros cerrados, búsqueda, versiones, duplicados y 503 del proveedor ausente aprobados. |
| `npm --prefix backend run openapi:lint` | Aprobado: OpenAPI 3.1, rutas protegidas y esquemas coherentes con la normalización ASCII. |
| `npm --prefix frontend run check` | Aprobado: lint sin errores, typecheck, 170/170 pruebas unitarias en 27 archivos y arquitectura con comprobaciones negativas. Windows usa un solo proceso aislado; no se ampliaron timeouts. |
| `npm --prefix frontend run build` | Aprobado; permanece la advertencia existente sobre el tamaño de chunk. |
| `npm --prefix frontend run test:e2e:prepared` | Aprobado: ejecuta `test:e2e` con Vite y backend standalone en puertos temporales; 30/30 escenarios. Incluye Vehículos y Conductores a 360/1280 px, invitaciones, teclado, foco, ausencia de overflow, cambios de contexto, conflictos y rechazo DRIVER por Assignments ausente. Swagger y health atraviesan el proxy real. |
| OpenSpec y diff | `openspec validate implement-vehicle-management --strict --no-interactive` y `git diff --check` aprobados; 21/21 tareas completas. |

### Correcciones necesarias para la regresión

Las pruebas de Conductores ahora simulan la denegación desde autorización local y verifican que no se consulta el repositorio. Sus E2E cubren tabla de escritorio, tarjetas móviles y detalle en diálogo, además de conservar la prueba de URL directa. Las identidades de prueba separan tipo y número de documento.

La integración de Empresas verifica los cuatro eventos duraderos de la transacción, correlación y versiones, en vez de esperar una llamada de auditoría externa durante operaciones permitidas. La carrera de política sigue exigiendo FORBIDDEN; una modificación de estado con autoridad global vigente exige COMPANY_VERSION_CONFLICT. En ambos casos se verifica que no persiste la edición ni su evento.

La fixture Keycloak resuelve la URL base antes de importar el realm y obtiene la identidad creada mediante Location, sin suponer que el servidor conserva el username previo a su normalización. Las cuatro pruebas aisladas de membresías aprobaron; no se modificó la pantalla ni se ampliaron timeouts. Vitest utiliza un solo proceso aislado en Windows para evitar el fallo observado al iniciar un worker de threads; en otras plataformas conserva threads.

### Reproducción y aislamiento

Los ejecutores preparados requieren Docker; HTTP también requiere OpenSSL. El backend standalone debe estar compilado antes de HTTP y E2E. No contienen credenciales persistentes: crean servicios, claves y configuración temporales y los retiran al terminar.

```powershell
npm --prefix backend run build
npm --prefix backend run check
npm --prefix backend run test:integration:prepared
npm --prefix backend run test:http:prepared
npm --prefix backend run openapi:lint
npm --prefix frontend run check
npm --prefix frontend run build
npm --prefix frontend run test:e2e:prepared
```

Todas las escrituras Mongo de integración se realizan en bases de prueba, con nombres aislados y sufijo `_test`. Las fixtures limpian sus bases/contenedores. El E2E de health/OpenAPI/Swagger no abre una base de datos; sus escenarios de negocio usan harnesses explícitos. El flujo HTTP de Vehículos sí usa MongoDB real. En este workspace sincronizado fue necesario regenerar únicamente `.next` por un EPERM de Windows en la salida standalone; el build posterior aprobó.

### Límites acreditados

El bootstrap usa el proveedor MongoDB `vehicle_assignments`. DRIVER y la desactivación devuelven 503 si la fuente no está disponible; una asignación activa devuelve 409 y conserva el vehículo activo. Alta, lectura y edición administrativas funcionan. La reactivación no restaura asignaciones. `VehicleFactsReader` informa elegibilidad por estado; no hay transferencia ni CRUD de asignaciones en este cambio. `vehicle_management_events` es historial local duradero, sin acreditar Audit transversal ni escrituras de facturas.

No se migraron datos funcionales ni se crearon índices en bases operativas. No se modificó un Keycloak persistente. La implementación quedó registrada en el commit `5d58449` de `openspec/implement-vehicle-management`; no se realizó push, merge, despliegue ni PR. La propuesta OpenSpec fue archivada como `2026-11-20-implement-vehicle-management` y la especificación `vehicle-management` quedó publicada en `openspec/specs`.
# Gestión de facturas — 2026-11-20

## Evidencia ejecutada

- Backend `check`, OpenAPI lint, typecheck y build pasaron; el build genera `/api/invoices`, `/api/invoices/[id]` y `/api/invoices/[id]/image`. Lint conserva advertencias sin errores.
- Frontend lint, typecheck, build, arquitectura, pruebas dirigidas de facturas y E2E responsive pasaron. E2E: 2 pruebas aprobadas a 360 y 1280 px.
- La integración Mongo aislada de facturas y asignaciones aprobó 10 pruebas en 2 archivos: alta e imagen, rollback de auditoría/reemplazo, reintentos idempotentes, conflictos de clave/versión, duplicidad concurrente, revocación, asignación concreta, cierre/desactivación concurrente e historial.
- Inventario de solo lectura y normalización de imágenes cubren filas incompatibles, duplicados, contenido/tipo falso, límites de tamaño y retirada de metadatos. `sharp` se registra como dependencia directa.
- Pruebas de aplicación y ventana temporal cubren edición no disponible (503), ventana y bordes exclusivos; no se declara Configuration productivo.

## Límites

- Vitest no mostró progreso en la suite unitaria completa del frontend, tanto con los workers configurados como con alternativas. Sus comprobaciones estáticas, build, arquitectura y pruebas dirigidas sí pasaron; repetir la suite completa en CI.
- La suite completa de integración backend pasó 60 pruebas en 14 archivos; una suite requiere variables de una fixture efímera de Keycloak que no estaban disponibles. Las suites pertinentes de facturas/asignaciones sí pasaron en replica set local aislada.
- La aceptación combina persistencia Mongo real con pruebas de aplicación para 503 y política controlada; no se ejecutó un recorrido HTTP end-to-end completo con Mongo. No se usaron datos personales ni un tercero productivo.

## Reproducción

Desde la raíz: `npm --prefix backend run check`, `npm --prefix backend run openapi:lint`, `npm --prefix backend run build`, `npm --prefix frontend run lint`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run build` y `npm --prefix frontend run test:e2e -- tests/e2e/invoice-management-responsive.spec.ts --workers=1`.

Para integración Mongo, `MONGODB_TEST_URI` debe apuntar a una base aislada terminada en `_test` sobre replica set:

```text
MONGODB_TEST_URI=mongodb://127.0.0.1:<puerto>/<base>_test?replicaSet=<nombre> npm --prefix backend run test:integration -- tests/integration/invoice-repository.test.ts tests/integration/assignment-repository.test.ts
```

La suite de integración completa también requiere variables de fixture efímera de Keycloak. Las transacciones no funcionan sobre Mongo standalone.

# Parameter management — cierre de implementación, 2026-11-21

## Resultado

Se completaron las 17 tareas de `implement-parameter-management`. El módulo de Configuration ofrece catálogo, inventario explícito, inicialización idempotente, historial y cambios transaccionales. La autorización administrativa se vuelve a confirmar por `policyVersion` dentro de la transacción. Invoices obtiene la política por contrato interno, confirma su revisión con fence Mongo y vuelve a comprobar el plazo con reloj de servidor. La factura QR se rechaza antes de consultar Configuration. La UI ahora tiene listado, detalle, historial, edición, estado vacío/error, control de permisos/contexto, cancelación de respuestas, diseño de tarjetas móvil y uso de componentes compartidos.

## Verificaciones

| Verificación | Resultado |
| --- | --- |
| `npm --prefix backend run check` | Aprobado: lint sin errores (advertencias existentes), typecheck, 459/459 pruebas unitarias en 50 archivos y arquitectura con verificaciones negativas. |
| `npm --prefix backend run test:integration -- --pool=forks --maxWorkers=1 tests/integration/invoice-repository.test.ts tests/integration/configuration-parameters.test.ts` | Aprobado con replica set Mongo aislada: 13/13 pruebas. Incluye inventario de solo lectura, índices, inicialización/actualización, rollback de auditoría, permiso revocado, fence y carreras reales, cambio de duración en factura MANUAL y vencimiento a las 12 horas. |
| `parameters:inventory` / `parameters:init` | Aprobados contra una base Mongo temporal `_test`: inventario vacío listo, instalación de 43.200 segundos, repetición sin cambios e inventario final con 1 parámetro/1 evento. La base temporal se eliminó; no se accedió a la base de `.env.local`. |
| `npm --prefix backend run openapi:lint` | Aprobado; OpenAPI 3.1 válida. |
| `npm --prefix backend run build` | Aprobado; Next genera las rutas `/api/parameters`, `/api/parameters/{key}` y `/api/parameters/{key}/history`. |
| Frontend lint y typecheck | Aprobados; quedan 14 advertencias React Hooks de otros módulos, sin errores. |
| `npm --prefix frontend test -- --pool=forks --isolate=false --maxWorkers=1 --reporter=verbose` | Aprobado: 215/215 pruebas en 36 archivos. En Windows usar un worker permitió registrar el progreso y terminar la suite completa. |
| `npm --prefix frontend run test:architecture` | Aprobado, incluidas las verificaciones negativas. |
| `npm --prefix frontend run build` | Aprobado; persiste la advertencia existente de bundle mayor a 500 kB. |
| `npm --prefix frontend run test:e2e -- tests/e2e/parameter-management-responsive.spec.ts --workers=1` | Aprobado: 2/2 recorridos a 360 y 1280 px, teclado, foco y diálogos. |
| `openspec validate implement-parameter-management --strict` | Aprobado; 17/17 tareas completas antes del archivo. |

La corrida por defecto de Vitest frontend no emitió avance en Windows; la modalidad explícita de forks, sin aislamiento y un worker completó toda la suite en 114 segundos. Las capturas/trazas E2E son artefactos locales de Playwright, no datos de usuarios.

## Reproducción segura

Mongo requiere replica set. Para las pruebas usa una URI `MONGODB_TEST_URI` que apunte a una base aislada terminada en `_test`. Los comandos operativos `parameters:inventory` y `parameters:init` leen `MONGODB_URI` o `MONGODB_URI_FILE`; para probarlos localmente, define `MONGODB_URI` explícitamente a una base temporal `_test` y `PARAMETERS_INIT_ACTOR` a un identificador técnico. No ejecutes el inicializador contra producción como parte de este test.

```powershell
npm --prefix backend run check
$env:MONGODB_TEST_URI = 'mongodb://127.0.0.1:<puerto>/<base>_test?replicaSet=<nombre>&directConnection=true'
npm --prefix backend run test:integration -- --pool=forks --maxWorkers=1 tests/integration/invoice-repository.test.ts tests/integration/configuration-parameters.test.ts
npm --prefix backend run openapi:lint
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test -- --pool=forks --isolate=false --maxWorkers=1
npm --prefix frontend run test:architecture
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/parameter-management-responsive.spec.ts --workers=1
```

La factura MANUAL conserva `createdAt` e historial cuando cambia el parámetro. Si Configuration no tiene un valor vigente, edición devuelve 503 sin fallback. La política nueva también se evalúa en facturas anteriores. La factura QR sigue inmutable y no se declara terminado el cambio separado de escaneo QR. No se modificaron datos persistentes ni configuración Keycloak.

## Cierre OpenSpec — 2026-11-22

Las propuestas `capture-keycloak-admin-events`, `implement-audit-delivery` e `implement-authorization` quedaron traducidas al español y archivadas. Se sincronizaron sus deltas en `openspec/specs/keycloak-admin-audit/`, `openspec/specs/audit/`, `openspec/specs/identity-access/` y `openspec/specs/frontend-shell/`. Cada cambio tenía todas las tareas completadas antes del archivo; la evidencia de cierre y verificación está en `docs/authorization-progress.md` y `docs/initial-invoices-app-closure.md`.
