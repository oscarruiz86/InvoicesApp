# Invoices App

Dos aplicaciones independientes: WebApp React/Vite y API REST Next.js. Incluye fundamentos técnicos, autenticación Keycloak mediante OIDC/PKCE, sesión frontend y `/api/auth/me` protegido con JWT/JWKS. El núcleo de autorización añade política de permisos y `/api/auth/permissions`; organizaciones, facturas, flota y sus integraciones reales siguen pendientes. No se ha desplegado en TrueNAS ni en otro entorno. Ver [autorización y preparación de la política](docs/authorization.md) y [estado de implementación](docs/authorization-progress.md).

## Requisitos y versiones

- Node.js 24.15.0 y npm 11.12.1; cada aplicación mantiene su lockfile.
- Docker Desktop/Engine con contenedores Linux y Docker Compose v2.
- Chromium de Playwright para pruebas de navegador.

Las versiones exactas y motores consultados están en [docs/dependency-matrix.json](docs/dependency-matrix.json). Las imágenes oficiales están fijadas por digest en [docs/image-matrix.json](docs/image-matrix.json). Ver [decisiones de dependencias](docs/dependencies.md), [arquitectura](docs/architecture.md), [runtime backend](docs/runtime.md) y [shell frontend](docs/frontend.md).

## Preparación inicial

Desde la raíz, copiar los ejemplos una sola vez, sin sobrescribir configuración propia:

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env.local
npm --prefix frontend ci
npm --prefix backend ci
```

No se necesita un manifiesto ni instalación npm en la raíz. Los archivos de entorno reales se ignoran en Git y Docker. No introducir secretos en variables `VITE_*`: se publican en el navegador.

En el entorno preparado se usa `MONGO_PORT=27019`, porque 27017 ya estaba ocupado; `.env` y `backend/.env.local` están alineados. Keycloak usa `KEYCLOAK_PORT=8181` y `http://localhost:8181` porque 8080 pertenece a otro servicio. Al recrear configuración desde ejemplos, conservar o ajustar esos puertos según los servicios del equipo.

| Configuración | Uso |
| --- | --- |
| frontend: `VITE_API_BASE_URL=/api` | Base pública relativa; también admite URL HTTP(S) sin credenciales. |
| frontend: `API_PROXY_TARGET=http://localhost:3000` | Destino privado del servidor Vite en host. Compose lo reemplaza por `http://backend:3000`. |
| backend: `MONGODB_URI` | URI requerida; en host apunta a `127.0.0.1:27017` y para el Compose local configura `replicaSet=invoices-rs`. |
| frontend: `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` | Grupo público completo para login; no contiene secretos. |
| backend: variables `KEYCLOAK_*` | Issuer/audiencia juntos; JWKS opcional. Obligatorios para `/api/auth/me`; técnicos públicos funcionan sin el grupo. |
| raíz: `FRONTEND_PORT`, `BACKEND_PORT`, `MONGO_PORT` | Publicaciones locales de Compose; por defecto 5173, 3000 y 27017. |
| raíz: `KEYCLOAK_PORT`, `KEYCLOAK_PUBLIC_URL`, `INVOICES_WEB_ORIGIN` | Por defecto 8080, `http://localhost:8080` y `http://localhost:5173`; alinear cuando se cambian puertos/orígenes. |
| raíz: `KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD` | Valores propios en `.env` ignorado; solo Keycloak, nunca Vite. |

El puerto interno Next.js es 3000. Si se necesita un puerto distinto para un proceso manual, se pasa al CLI/proceso; no se configura mediante `backend/.env.local`. Cambiar variables Vite exige reiniciar desarrollo o reconstruir el bundle estático.

## Ejecución en el host

Completar las credenciales locales de bootstrap en `.env`. Arrancar Docker, MongoDB y Keycloak:

```powershell
docker compose up -d mongodb keycloak
```

MongoDB usa un replica set local de un nodo; para el backend ejecutado en el host, configura `MONGODB_URI=mongodb://127.0.0.1:27017/invoices_app?replicaSet=invoices-rs&directConnection=true` (ajusta el puerto publicado si es necesario).

En dos terminales diferentes:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Abrir la WebApp en **http://localhost:5173**. El navegador consulta `/api` mediante Vite, que preserva ese prefijo. No debe intentar resolver nombres internos como `backend` o `mongodb`.

En la consola Keycloak (`http://localhost:8080` por defecto), crear un usuario en el realm `invoices` y establecer su contraseña únicamente allí. Abrir **Mi sesión** en la WebApp para realizar login. Ver [autenticación](docs/authentication.md) para configurar roles, orígenes, Swagger y pruebas. Si 8080 ya está ocupado, elegir otro puerto y alinear URL pública, issuer y variables frontend según esa guía.

## Ejecución de desarrollo con Docker

Como alternativa al host, detener los servidores locales que ocupen 3000/5173 y ejecutar:

```powershell
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps
docker compose logs backend
```

Compose ejecuta los targets `development`, con recarga y bind mounts. Las dependencias Linux y `.next` residen en volúmenes separados de las instalaciones Windows. Al cambiar manifiestos/lockfiles hay que reconstruir y actualizar el volumen de dependencias de la aplicación correspondiente; no reutilizar módulos de otra plataforma. La comprobación sobre el disco Windows detectó que no se propagan sus eventos: Compose activa polling de Vite (`CONTAINER_POLLING`) y Next con Webpack/Watchpack (`WATCHPACK_POLLING`). Este ajuste se limita a contenedores de desarrollo; el comando Next en host conserva Turbopack.

MongoDB y Keycloak usan volúmenes persistentes. Las publicaciones se limitan a loopback y este Compose no está destinado a producción. La importación inicial del realm no sobrescribe uno existente. Las variables `environment` de Compose prevalecen sobre `env_file`; issuer público se conserva y JWKS usa el destino interno Keycloak. Si los volúmenes de dependencias ya existían, actualizarlos con `docker compose run --rm --no-deps frontend npm ci` y su equivalente backend antes de arrancar el código actualizado.

## API técnica

| URL | Resultado |
| --- | --- |
| http://localhost:3000/api/health | HTTP 200, JSON `status: ok`, sin caché. |
| http://localhost:3000/api/openapi | Contrato único OpenAPI 3.1.0. |
| http://localhost:3000/api/docs | Swagger con assets locales, sin CDN. |
| http://localhost:5173/api/docs | La misma documentación por el proxy frontend. |
| http://localhost:3000/api/auth/me | Perfil mínimo autenticado; requiere Access Token Bearer. |
| http://localhost:5173/session | Ruta privada de verificación de sesión. |

Health expresa **vida del proceso**, no disponibilidad de MongoDB ni autenticación. Funciona sin conexión de datos siempre que la configuración tenga formato válido. Configuración inválida devuelve 503 `CONFIGURATION_ERROR`; un fallo inesperado devuelve 500 `INTERNAL_ERROR`, sin secretos o stack.

```powershell
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail http://localhost:3000/api/openapi
curl.exe --fail http://localhost:5173/api/health
```

En shells Unix se puede usar `curl` en lugar de `curl.exe`.

## Validación

Los comandos de calidad no necesitan API, MongoDB ni Keycloak:

```powershell
npm --prefix frontend run check
npm --prefix backend run check
npm --prefix backend run openapi:lint
npm --prefix frontend run build
npm --prefix backend run build
```

La autenticación tiene pruebas reales aisladas, con puertos libres, realms y usuarios efímeros, sin guardar credenciales:

```powershell
node scripts/test-keycloak.mjs
node scripts/test-authentication.mjs --mode=host
node scripts/test-authentication.mjs --mode=compose
```

`GET /api/auth/me` devuelve 401 ante credencial ausente/inválida con configuración completa, o 503 si identidad no está configurada. Swagger permite Authorize con un Access Token propio temporal y no lo persiste. Health sigue expresando únicamente vida del proceso.

`check` reúne lint, tipos, unitarias y arquitectura. El grafo arquitectónico se contrasta además con ejemplos negativos temporales que deben detectar frameworks en Domain, reexportaciones por alias hacia adaptadores y ciclos. Las capas reservadas no incluyen entidades o patrones artificiales.

Para integración MongoDB, usar exclusivamente una base de pruebas terminada en `_test`:

```powershell
# Ajustar al MONGO_PORT de .env; en este entorno se configuró 27019.
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27019/invoices_foundations_test'
npm --prefix backend run test:integration
```

Después del build backend, el siguiente comando levanta y cierra procesos Next aislados en puertos libres. Verifica salud sin MongoDB, OpenAPI, Swagger y configuración inválida. Opcionalmente `TEST_API_BASE_URL` añade comprobaciones contra un servidor existente:

```powershell
npm --prefix backend run test:http
```

Para navegador, iniciar el backend en 3000 y ejecutar:

```powershell
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Playwright arranca/reutiliza Vite en 5173. `E2E_BASE_URL` permite usar un frontend existente (por ejemplo una imagen final). Comprueba 360/1280 px, navegación y recarga, errores/reintento y Swagger/API por proxy. Las capturas se guardan en `.artifacts/`; los fallos conservan trazas en `frontend/test-results/`.

## Imágenes finales: verificación local, sin despliegue

```powershell
docker build --file frontend/Dockerfile --target production -t invoices-frontend:local .
docker build --file backend/Dockerfile --target production -t invoices-backend:local .
docker network create invoices-smoke
docker run --rm -d --name invoices-smoke-backend --network invoices-smoke --network-alias backend -e MONGODB_URI=mongodb://127.0.0.1:1/smoke_test -p 127.0.0.1:3200:3000 invoices-backend:local
docker run --rm -d --name invoices-smoke-frontend --network invoices-smoke -e API_UPSTREAM=http://backend:3000 -p 127.0.0.1:8180:8080 invoices-frontend:local
curl.exe --fail http://localhost:8180/api/health
curl.exe --fail http://localhost:8180/api/docs
docker stop invoices-smoke-frontend invoices-smoke-backend
docker network rm invoices-smoke
```

Frontend final sirve estáticos con Nginx y fallback SPA; sus proxies `/api` y `/docs-assets/` usan `API_UPSTREAM`, no el proxy de Vite. Backend final usa salida standalone y usuario sin privilegios. La URI inaccesible de este smoke test demuestra que health no abre conexiones. No sustituye la prueba MongoDB.

## Parada y diagnóstico

```powershell
docker compose down
```

La parada normal conserva datos y volúmenes. No ejecutar eliminación de volúmenes como rutina. Si un puerto está ocupado, detener la instancia anterior o cambiar su publicación en `.env`; no ejecutar host y Compose en los mismos puertos. Si npm informa archivos bloqueados en Windows, detener procesos que usen esa instalación antes de reintentar `npm ci`.

El seguimiento de autenticación está en `openspec/changes/implement-authentication/tasks.md`; foundations está archivado. No se completan automáticamente tareas de `initial-invoices-app`. Los módulos de negocio requieren sus propios cambios y aprobación.

El selector de empresa/tercero, contexto GLOBAL y restauración por pestaña se describen en [contexto organizacional](docs/organization-context.md). Consulta [su evidencia y dependencias](docs/organization-context-progress.md) antes de habilitar recursos operativos. Sin asociaciones autorizadas se muestra el estado vacío; no se crean asociaciones al iniciar sesión. La aceptación aislada se ejecuta con `node scripts/test-organization-context.mjs` y requiere Docker, MongoDB de pruebas y Playwright.
