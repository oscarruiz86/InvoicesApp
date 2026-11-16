# Design

## Context

Se revisaron los cuatro tipos de artefactos de `initial-invoices-app`: propuesta, diseño, siete especificaciones y 36 tareas pendientes. La validación estricta de esa propuesta pasa. No existen aplicaciones, manifiestos de paquetes, pruebas ni Dockerfiles; `openspec/specs/` todavía no publica capacidades base. Ver `proposal.md` para la motivación de este incremento.

Este cambio materializa únicamente una parte de las bases técnicas de la propuesta inicial. Sus artefactos y tareas se conservan sin modificar. El estado completo de planificación no acredita aprobación ni ejecución. La implementación de este incremento exige una aprobación nueva y explícita; no requiere resolver reglas de facturas, organizaciones o flota que no se ejecutarán aquí.

## Goals / Non-Goals

**Goals:** dos aplicaciones que se instalan, prueban y compilan por separado; límites arquitectónicos comprobables antes de módulos funcionales; shell navegable, servicios técnicos y ejecución local reproducible.

**Non-Goals:** login/logout, sesiones, validación real de tokens, autorización de recursos, CRUD, captura QR, entidades/repositorios/modelos de negocio, auditoría funcional, microservicios, broker, contenedor de DI, despliegue o configuración TrueNAS. No se crearán clases de dominio ficticias para rellenar carpetas.

## Decisions

### 1. Independencia de aplicaciones y estándares heredados

`frontend/` y `backend/` tendrán cada uno `package.json`, `package-lock.json`, configuración TypeScript, scripts, pruebas, `.env.example`, `.dockerignore` y Dockerfile. Se propone npm con lockfiles separados y Node.js 24 LTS en la misma revisión para ambas aplicaciones e imágenes. No habrá workspace npm raíz, imports cruzados ni un paquete de dominio compartido. Docker Compose será el coordinador de desarrollo.

Se elige una línea Node LTS y no una versión experimental; su estado está documentado por [Node.js](https://nodejs.org/en/about/previous-releases). Node 24 satisface los mínimos publicados de [Vite](https://vite.dev/guide/), [Next.js](https://nextjs.org/docs/app/getting-started/installation) y [Vitest](https://vitest.dev/guide/). La combinación completa de versiones no se declara probada: al implementar se fijarán versiones estables compatibles, lockfiles y etiquetas/digests de imágenes tras verificar motores, peer dependencies, compilaciones y pruebas. No se usará `latest` como configuración reproducible.

Las dependencias seguirán `Presentation -> Application -> Domain` e `Infrastructure -> Application/Domain`. Domain no importa capas externas ni frameworks; Application no importa frameworks ni adaptadores concretos. La composición externa (`frontend/src/app`, `backend/src/bootstrap`) construye implementaciones e inyecta puertos; las capas internas nunca la importan. Los Route Handlers son puntos de entrada HTTP que pueden obtener controladores del bootstrap, sin realizar lógica de negocio ni usar Mongoose.

| SOLID | Evidencia prevista en este incremento |
| --- | --- |
| S | Layout, caso de uso de consulta de salud, transporte HTTP, configuración y conexión MongoDB tienen responsabilidades separadas. |
| O | El transporte del shell se sustituye mediante un puerto sin modificar el caso de uso. |
| L | El adaptador HTTP y su doble respetan los mismos resultados, errores y cancelación declarados. |
| I | Un puerto de consulta de salud cubre esa necesidad concreta; no se crea un servicio universal de negocio. |
| D | Application define sus necesidades; Infrastructure las implementa y el bootstrap las conecta. |

`dependency-cruiser` comprobará imports y ciclos en ambas aplicaciones, incluidas rutas por alias y reexportaciones. Sus reglas deben distinguir el punto de composición y los puntos de entrada de las capas internas. Se verificarán también contra un ejemplo negativo de dependencia prohibida para demostrar que detectan incumplimientos, sin dejar ese ejemplo en el código productivo.

### 2. Módulos y bounded contexts

Los límites heredados son Identity & Access, Organizations, Fleet Management, Invoice Management, Configuration y Audit. Se reservan sus directorios y una breve guía de propiedad y capas, sin crear entidades, servicios, repositorios ni endpoints de negocio. Las capas sin responsabilidad real pueden conservarse con `.gitkeep` y documentación.

Frontend mantiene los nombres `authentication`, `organizations`, `vehicles` e `invoices`; `vehicles` corresponde a Fleet. Backend mantiene `identity`, `organizations`, `fleet`, `invoices`, `configuration` y `audit`. Configuration/Audit tendrán UI solo en un cambio que la requiera. `home` es un módulo técnico de presentación provisional, no un nuevo bounded context de negocio. La comprobación de salud vive como infraestructura/presentación técnica, sin inventar un agregado Health.

Estructura objetivo tras aprobar e implementar; este documento no crea estos archivos:

```text
README.md
.env.example                         # variables de Compose
compose.yaml
frontend/
  package.json
  package-lock.json
  .env.example
  .dockerignore
  Dockerfile
  nginx/default.conf.template          # fallback SPA y proxy del target final
  index.html
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  tsconfig*.json
  eslint.config.*
  .dependency-cruiser.cjs
  src/
    app/                             # composición, providers y router
    modules/
      home/
        domain/                      # reservado, sin entidades ficticias
        application/                 # consulta técnica por puerto
        infrastructure/              # adaptador HTTP de salud
        presentation/                # pantalla y store de estado UI
      authentication/{domain,application,infrastructure,presentation}/
      organizations/{domain,application,infrastructure,presentation}/
      vehicles/{domain,application,infrastructure,presentation}/
      invoices/{domain,application,infrastructure,presentation}/
    shared/
      application/                   # resultado/errores compartidos puros si hacen falta
      infrastructure/http/           # cliente fetch común
      infrastructure/config/         # entorno público validado
      components/                    # layout, avisos, error boundary
      hooks/                         # solo presentación
      theme/                         # tema MUI
  tests/{setup,e2e}/
backend/
  package.json
  package-lock.json
  .env.example
  .dockerignore
  Dockerfile
  next.config.*
  tsconfig.json
  vitest.config.ts
  eslint.config.*
  .dependency-cruiser.cjs
  openapi/openapi.json                # contrato único OpenAPI 3.1.0
  scripts/                           # preparación de assets Swagger
  public/docs-assets/                # assets locales generados, ignorados en Git
  src/
    app/api/
      health/route.ts
      openapi/route.ts
      docs/route.ts
    bootstrap/                       # composición y validación de runtime
    modules/
      identity/
        domain/                      # reservado
        application/                 # contrato mínimo futuro de identidad
        infrastructure/keycloak/     # configuración; sin autenticación operativa
        presentation/                # reservado
      organizations/{domain,application,infrastructure,presentation}/
      fleet/{domain,application,infrastructure,presentation}/
      invoices/{domain,application,infrastructure,presentation}/
      configuration/{domain,application,infrastructure,presentation}/
      audit/{domain,application,infrastructure,presentation}/
    shared/
      domain/                        # reservado, sin modelo artificial
      application/                   # errores internos puros solo si hacen falta
      infrastructure/{config,mongodb}/
      presentation/http/             # control técnico de salud, errores HTTP
  tests/{unit,integration,http}/
```

La notación con llaves abrevia directorios, no prescribe nombres literales. Cada módulo expone únicamente contratos públicos necesarios. No se crea un repositorio CRUD genérico ni un núcleo compartido con reglas de negocio futuras.

### 3. Shell frontend y flujo de comunicación

React Router se usará en modo declarativo con ruta `/` y una vista de ruta no encontrada. El modo declarativo se ajusta a una SPA Vite, sin incorporar otro servidor o framework de aplicación; véase [instalación oficial](https://reactrouter.com/start/declarative/installation). Se propone el paquete `react-router`.

El tema global Material UI establecerá tipografía, paleta y espaciado mediante ThemeProvider y CssBaseline. Un layout con cabecera y contenido adaptable debe funcionar a 360 px y 1280 px sin desbordamiento horizontal. La pantalla provisional mostrará “Invoices App”, una indicación de base técnica y el estado de la API (cargando, disponible o error), con acción de reintento. No mostrará navegación funcional de módulos aún no implementados.

El flujo será componente/acción de presentación -> caso de uso de consulta de salud -> puerto específico -> adaptador del módulo -> cliente fetch reutilizable. El bootstrap inyecta el adaptador. El estado de carga/resultado/error se mantendrá en un store Zustand de presentación, sin persistencia local ni reglas de negocio. Los componentes no harán `fetch` directamente.

El cliente común resolverá la base de API, cancelación y tiempo de espera finito, verificará el estado HTTP y tolerará errores con cuerpo no JSON. El adaptador validará el resultado esperado del endpoint. Errores de red, cancelación, timeout, respuesta malformada y HTTP se traducirán a categorías de aplicación estables; la presentación centraliza los mensajes. Un error boundary cubrirá errores de render y los errores asíncronos se manejarán por el flujo del caso de uso/store. No se añaden Axios, interceptores de autenticación ni reintentos automáticos de operaciones arbitrarias.

### 4. Configuración y separación de secretos

| Archivo futuro | Variables | Política |
| --- | --- | --- |
| `frontend/.env.example` | `VITE_API_BASE_URL=/api`; `API_PROXY_TARGET=http://localhost:3000` | La primera es pública y permite `/api` o URL HTTP(S). La segunda la usa solo el servidor Vite; no se publica con prefijo VITE. |
| `backend/.env.example` | `NODE_ENV=development`, `MONGODB_URI=mongodb://127.0.0.1:27017/invoices_app`; opcionales `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_AUDIENCE` | No se incluyen credenciales reales. MongoDB valida esquema/forma, sin exigir conexión para compilar. Si se configura uno de los campos Keycloak, se exige el grupo completo válido. El puerto interno será 3000; cualquier override `PORT` se pasa al proceso, no se confía en `.env.local` para configurar el servidor Next. |
| `.env.example` raíz | `FRONTEND_PORT=5173`, `BACKEND_PORT=3000`, `MONGO_PORT=27017` | Solo interpolación de Compose. No sustituye los archivos de entorno de cada aplicación. |
| Imagen final frontend | `API_UPSTREAM=http://backend:3000` | Variable de runtime de la plantilla Nginx para validación local en una red con alias `backend`; no se incorpora al bundle del navegador. |

Backend validará el entorno con Zod en el bootstrap de runtime, antes de procesar solicitudes técnicas; un error produce un diagnóstico con nombres de variables, sin valores sensibles, y un HTTP 503 de configuración inválida. No se asumirá que declarar una variable en `next.config` la hace privada: no se inyectan secretos en bundles ni OpenAPI. El build no abre conexiones ni exige credenciales de servicios; las pruebas usarán entornos explícitos para evitar depender del `.env` del desarrollador.

Frontend validará su configuración pública antes de iniciar comunicación y mostrará un error de configuración entendible si es inválida. Se propone Zod también para este límite externo, ubicado en Infrastructure y sin filtrarse a capas internas. Las variables VITE se resuelven al arrancar Vite/compilar: modificar el entorno de un contenedor estático no cambia un bundle existente. Cambios de entorno requieren reiniciar el dev server o reconstruir según el modo.

Los archivos reales `.env`/`.env.local`, dependencias y salidas se ignorarán en Git y contextos Docker. Los ejemplos serán autocontenidos y sin secretos; los puertos locales se consideran valores propuestos editables.

### 5. Backend REST, errores y comprobación de vida

Next.js App Router usará exclusivamente Route Handlers y runtime Node.js para servicios técnicos. No se crean `page.tsx`, layouts de producto, Server Actions ni frontend Next.js. Los [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) ofrecen entradas HTTP separadas de páginas. React/React DOM pueden existir como dependencias requeridas por Next.js sin usarse para una interfaz de producto.

| Endpoint | Resultado previsto | Dependencias externas |
| --- | --- | --- |
| `GET /api/health` | HTTP 200, `application/json`, cuerpo con `status: "ok"`, `Cache-Control: no-store` | Ninguna conexión MongoDB ni llamada Keycloak. |
| `GET /api/openapi` | HTTP 200, documento JSON con `openapi: "3.1.0"` | Ninguna. |
| `GET /api/docs` | HTTP 200, HTML técnico Swagger que carga `/api/openapi` y assets locales | Ninguna CDN ni página de producto. |

Con configuración de runtime inválida, estos servicios devuelven el error de configuración HTTP 503 en lugar de confirmar estado operativo. Con configuración válida pero MongoDB caído, health sigue siendo HTTP 200: expresa vida del proceso, no preparación de la base de datos. No se añade `/ready`, escritura de prueba ni información sensible en health.

Los controladores técnicos viven en Presentation y el bootstrap los conecta; no se crea un caso de uso ni servicio de dominio para devolver un estado constante. Los errores internos se traducirán a un envelope con `error.code` y `error.message`; códigos previstos: `CONFIGURATION_ERROR` (503) e `INTERNAL_ERROR` (500), con mensajes públicos neutros. Los fallos inesperados no exponen stack, URI, credenciales o detalles del proveedor. Los errores de transporte se tratan solo en los límites HTTP; no se crean excepciones de dominio para problemas técnicos.

### 6. Conexión MongoDB reutilizable

Infrastructure contendrá una función/adaptador de conexión Mongoose de inicialización perezosa, con caché de conexión y promesa en curso reutilizable dentro de cada proceso, incluso durante hot reload de desarrollo. Solicitudes concurrentes comparten el intento; un intento rechazado limpia la promesa para permitir reintentos posteriores. Los procesos/containers mantienen pools independientes: no se promete una conexión global entre réplicas.

Se definirán timeouts finitos y tratamiento explícito de error y desconexión conforme al ciclo de conexiones de [Mongoose](https://mongoosejs.com/docs/connections.html). No se conectará al importar módulos, al compilar o al consultar health. Tampoco se cerrará el pool después de cada solicitud. Una prueba de integración con MongoDB desechable o una base de pruebas aislada verificará apertura, reutilización, rechazo y recuperación; no se crearán modelos ni colecciones de negocio.

Se descarta un repositorio genérico porque aún no hay agregados que persistir. El cliente Mongoose no saldrá de Infrastructure; los futuros repositorios implementarán los puertos de sus capas internas cuando exista una capacidad funcional aprobada.

### 7. OpenAPI 3.1 y Swagger sin frontend Next.js

`backend/openapi/openapi.json` será la única fuente del contrato inicial: OpenAPI 3.1.0, esquemas de salud/errores, respuestas 200/503/500 donde correspondan y servidor relativo `/` para funcionar por backend directo o proxy. Se documenta health como liveness y sin requisito de autenticación (`security: []`). No se anunciarán endpoints de negocio, un login operativo ni un esquema de seguridad aplicado que no existe.

`/api/openapi` entrega ese documento y `/api/docs` entrega únicamente la documentación técnica mediante un handler HTML, sin página React Next.js. Esta superficie de documentación acompaña la API REST y no es la WebApp. Se usará `swagger-ui-dist`, pensado para servir assets desde servidores según la [documentación de Swagger](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/). Un script de preparación copiará CSS/JS necesarios a `public/docs-assets/` al iniciar desarrollo o construir; no se cargará una CDN ni se editará el paquete instalado. La imagen final incluirá esos assets y el contrato.

La versión elegida de Swagger y el validador `@redocly/cli` deberán soportar 3.1. Se comprobarán validez del documento, render de Swagger y correspondencia de health/errores con el contrato; el contrato se mantiene explícito, sin generación por anotaciones que pueda divergir inadvertidamente.

### 8. Límite Keycloak preparado, sin login

En `identity/application` se documentará un puerto mínimo de verificación futura y un actor interno independiente del proveedor, solo con los datos necesarios para delimitar ese contrato. `identity/infrastructure/keycloak` preparará lectura/configuración de issuer y audiencia, sin llamadas reales, SDK, almacenamiento de tokens ni implementación que acepte tokens de prueba.

La configuración opcional se valida si se suministra. No configurar Keycloak permite el arranque porque solo hay servicios técnicos públicos. Configurarlo tampoco activa autenticación: se documenta como preparación inactiva. No habrá contenedor Keycloak en Compose, registro de clientes/realms, redirecciones, botones de login, middleware que simule identidad ni bypass presentado como seguridad. Los futuros endpoints protegidos requerirán otro cambio con verificación real y denegación por defecto.

Las decisiones P1–P7 de la propuesta inicial siguen pendientes para sus contextos funcionales. En particular P6 no bloquea este límite inactivo, pero será requisito del cambio de autenticación. No se fija ahora una matriz de roles, una sesión de navegador o un modelo de usuario persistido.

### 9. Docker y red de desarrollo

Cada Dockerfile tendrá al menos un target `development` y otro final verificable. Los targets de desarrollo ejecutarán los respectivos scripts `dev` escuchando en `0.0.0.0` dentro del contenedor. Los finales compilarán cada aplicación de forma independiente: frontend como estáticos servidos con Nginx y fallback SPA; backend con salida Next.js standalone, proceso sin privilegios y assets necesarios. No se desplegarán estas imágenes.

`compose.yaml` seleccionará los targets de desarrollo y definirá `frontend`, `backend` y `mongodb`, red bridge común y un volumen nombrado para MongoDB. Bind mounts de código permitirán recarga, con volúmenes separados por aplicación para `node_modules` y salidas de build para evitar mezclas Windows/Linux. Los servicios y las imágenes usarán versiones fijadas al implementar; la imagen MongoDB deberá ser compatible con Mongoose seleccionado.

| Origen | Destino | Dirección propuesta |
| --- | --- | --- |
| Navegador | frontend dev | `http://localhost:5173` |
| Navegador a través de Vite | API | `/api/*`, incluyendo health y documentación |
| Vite en host | API | `API_PROXY_TARGET=http://localhost:3000` |
| Vite en Compose | API | `API_PROXY_TARGET=http://backend:3000` |
| backend en Compose | MongoDB | `mongodb://mongodb:27017/invoices_app` |
| backend en host | MongoDB publicado localmente | `mongodb://127.0.0.1:27017/invoices_app` |

El navegador nunca resuelve `backend` o `mongodb`: esos nombres pertenecen a la [red Compose](https://docs.docker.com/compose/how-tos/networking/). Vite conservará el prefijo `/api` al reenviar; no se reescribe a `/health`. También reenviará `/docs-assets/` al backend para que Swagger funcione al abrirse por el origen del frontend. El proxy de Vite sirve solo desarrollo. El target estático frontend usará Nginx con los mismos proxies `/api` y `/docs-assets/`, configurados mediante `API_UPSTREAM`; `VITE_API_BASE_URL=/api` seguirá siendo válido. Para verificar imágenes finales localmente se usará la misma red con ese upstream documentado, sin asumir el proxy de Vite. No se abre CORS global como solución a un error de red; el flujo previsto usa mismo origen mediante proxy.

Las publicaciones de puertos se limitarán a loopback del host por defecto. El Compose de desarrollo podrá exponer MongoDB en `127.0.0.1:27017` para ejecutar aplicaciones/pruebas desde el host; no se expone fuera del equipo. Un healthcheck MongoDB y `depends_on: service_healthy` ordenarán el arranque inicial del backend, sin convertir liveness en readiness. El healthcheck del backend usa su endpoint y no necesita instalar curl en la imagen.

Keycloak no forma parte del arranque. Detener Compose preservará datos; borrado del volumen será una acción manual explícita y fuera de los comandos normales de validación.

### 10. Dependencias necesarias para la implementación futura

| Aplicación | Producción | Desarrollo/pruebas |
| --- | --- | --- |
| Frontend | `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `zustand`, `react-router`, `zod` | `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `dependency-cruiser` |
| Backend | `next`, `react`, `react-dom` (requisitos del framework), `mongoose`, `zod`, `swagger-ui-dist` | `typescript`, `@types/node`, tipos React requeridos por Next, `eslint`, `eslint-config-next`, `vitest`, `vite` solo para el runner de pruebas si lo requiere su versión, `dependency-cruiser`, `@redocly/cli` |

Se usa fetch nativo; no se añaden cliente MongoDB directo, Axios, SDK Keycloak, framework HTTP adicional ni librería de DI. Herramientas del host: Node/npm, Docker Engine o Docker Desktop con Linux containers y Docker Compose v2. Playwright requerirá instalar Chromium para su prueba de navegador después de aprobar. Nginx y MongoDB son imágenes de infraestructura, no paquetes npm. Los paquetes de tipos y peer dependencies exactos se ajustarán a las versiones estables seleccionadas, sin ampliar el alcance funcional.

### 11. Pruebas, aceptación y scripts previstos

| Verificación | Evidencia requerida |
| --- | --- |
| Frontend puro | Caso de uso de salud con puerto falso; categorías de error, cancelación y traducción HTTP. |
| Frontend presentación | Vitest + Testing Library/jsdom para carga/éxito/error, reintento, store y tema; Playwright en Chromium para `/`, 404, reload y layout a 360/1280 px. |
| Backend técnico | Vitest en Node para entorno válido/inválido, configuración Keycloak opcional/parcial, conexión compartida y promesa fallida con dobles. |
| MongoDB | Integración separada sobre base de pruebas, reuso y fallo/recuperación; sin requerir MongoDB para pruebas unitarias. |
| REST/OpenAPI | Prueba HTTP contra Next.js real: salud JSON/no-store, documento 3.1, Swagger y assets, error neutral de configuración y servidor disponible con MongoDB detenido. |
| Arquitectura | Reglas de dependencias en ambos proyectos, ausencia de ciclos/imports cruzados, capas internas sin frameworks y ausencia de modelos/funcionalidades ficticias. |
| Operación local | Dockerfiles compilan; Compose válido; shell muestra estado API mediante proxy en host y contenedores; recarga funciona; README reproduce el recorrido. |

Scripts propuestos por aplicación: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:architecture`, `check`. `test` ejecuta Vitest sin watch; `check` agrupa lint, tipos, unitarias y arquitectura, sin levantar servicios externos. Frontend añade `test:e2e` (Playwright); backend añade `test:integration` (MongoDB), `test:http` (API en ejecución) y `openapi:lint` (Redocly). Frontend `start` será preview local de build, no servidor de despliegue; la imagen final usa Nginx.

El README futuro documentará instalación inicial `npm install` para generar lockfiles durante implementación y `npm ci` para siguientes ejecuciones. Los siguientes comandos se proponen para después de implementar; no se ejecutan como parte de esta entrega:

```powershell
# Desde la raíz: preparar ejemplos de desarrollo
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env.local

# Instalación reproducible una vez existan los lockfiles
npm --prefix frontend ci
npm --prefix backend ci

# MongoDB local para las apps en el host
docker compose up -d mongodb
# Dos terminales separadas
npm --prefix backend run dev
npm --prefix frontend run dev

# Alternativa: todos los servicios en contenedores
docker compose config
docker compose up --build -d
docker compose ps
docker compose logs backend
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail http://localhost:3000/api/openapi
curl.exe --fail http://localhost:3000/api/docs
curl.exe --fail http://localhost:5173/api/health

# Calidad y compilación por aplicación
npm --prefix frontend run check
npm --prefix backend run check
npm --prefix backend run openapi:lint
npm --prefix frontend run build
npm --prefix backend run build
npm --prefix backend run test:integration
npm --prefix backend run test:http
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e

# Verificar imágenes finales sin desplegar
docker build --target production -t invoices-frontend:local ./frontend
docker build --target production -t invoices-backend:local ./backend
docker compose down
```

Las alternativas host/contenedores no se ejecutan simultáneamente en los mismos puertos. `test:integration` usará `MONGODB_TEST_URI` explícita a una base aislada y `test:http` usará `TEST_API_BASE_URL` (por defecto localhost:3000). E2E apuntará al frontend levantado, por defecto localhost:5173, con `E2E_BASE_URL` opcional. Las pruebas de configuración inválida usarán otro proceso/puerto para no alterar los servicios de desarrollo. El README incluirá equivalentes de curl para otros shells y los pasos de smoke test de imágenes finales con upstream Nginx y configuración de backend; ningún comando presupone despliegue TrueNAS.

## Risks / Trade-offs

- [Confundir preparación Keycloak con autenticación] → Contrato inactivo explícito, sin login ni verificación simulada; solo endpoints técnicos públicos.
- [Confundir liveness y disponibilidad de datos] → Health no usa MongoDB; las pruebas de conexión y su diagnóstico son verificaciones separadas.
- [Configuración inválida oculta durante build] → Bootstrap valida runtime y devuelve 503 neutro; prueba específica contra un proceso con entorno inválido.
- [Secretos en frontend o logs] → Variables públicas mínimas, ejemplos sin credenciales y errores sin volcar valores de entorno.
- [Nombres Docker usados en el navegador] → Base `/api` y proxy configurado según host o Compose.
- [Cambios de dependencias y compatibilidad] → Lockfiles, imágenes fijadas y verificación de ambas compilaciones, Swagger 3.1 y peers al implementar.
- [Directorios DDD vacíos interpretados como dominio implementado] → Reserva documentada, sin clases artificiales ni aceptación de módulos funcionales.
- [Diferencias de bind mounts en Windows] → Dependencias por contenedor y verificación de recarga; polling solo como ajuste documentado si se necesita.
- [Solapamiento con tareas de la propuesta base] → Registrar correspondencia, mantener sus casillas sin cambios y reconciliar evidencias en un paso posterior explícito.

## Migration Plan

No hay aplicación ni datos que migrar. Tras aprobación se crearán aplicaciones e infraestructura en pasos pequeños, con comprobación de límites antes del shell y los servicios técnicos. Las pruebas de cada grupo se incorporarán con su implementación. El cierre exigirá evidencias de aceptación y documentación reproducible; esta planificación no sincroniza especificaciones ni archiva cambios.

No se ejecutará ningún despliegue. Revertir este incremento futuro afectará los archivos nuevos de foundations; los volúmenes locales se conservarán salvo instrucción explícita. Los módulos funcionales y las decisiones P1–P7 quedan para cambios posteriores con sus propias propuestas y aprobación.
