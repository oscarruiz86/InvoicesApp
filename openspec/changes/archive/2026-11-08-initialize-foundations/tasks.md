# Tasks

Seguimiento de `initialize-foundations`. El usuario aprobó su ejecución mediante `$openspec-apply-change initialize-foundations`; la autorización está registrada en `docs/foundations-progress.md`. Las casillas se completan únicamente tras implementar y verificar su comportamiento. La aprobación se limita a foundations y no habilita aplicar `initial-invoices-app` completo ni desplegar.

Cada tarea debe respetar SOLID/DDD/Clean Architecture y conservar la independencia de aplicaciones. Cada grupo incorpora sus pruebas y documentación; el último grupo verifica la integración, sin posponer pruebas unitarias a ese punto.

## 1. Aprobación y decisiones técnicas del incremento

- [x] 1.1 Registrar la aprobación explícita de `initialize-foundations` y la correspondencia parcial con las tareas 3.1–3.5 de la propuesta base; verificar que el alcance aceptado excluye negocio, login y despliegue y que no se marcan tareas de `initial-invoices-app` automáticamente (`local-development`).
- [x] 1.2 Fijar una matriz compatible de versiones estables Node 24/npm, paquetes, MongoDB e imágenes, verificando motores, peer dependencies y soporte OpenAPI 3.1; registrar las versiones exactas y la estrategia de lockfiles en documentación antes de instalar (`local-development`, diseño 1 y 10).

## 2. Aplicaciones independientes y límites arquitectónicos — requiere 1

- [x] 2.1 Crear la base frontend Vite/React/TypeScript con manifiesto y lockfile propios, scripts y configuración de lint/tipos/pruebas; verificar instalación reproducible y compilación independiente, sin crear módulos funcionales (`local-development`).
- [x] 2.2 Crear la base backend Next.js/TypeScript con manifiesto y lockfile propios y runner de pruebas Node; verificar build independiente con servicios externos detenidos y ausencia de páginas de producto, Server Actions y dependencias internas del frontend (`backend-runtime`, `local-development`).
- [x] 2.3 Reservar los módulos y cuatro capas del diseño, documentar propiedad de los seis contextos y preparar puntos de composición; verificar estructura y guía arquitectónica sin entidades, repositorios ni modelos ficticios (`local-development`).
- [x] 2.4 Configurar `test:architecture` en ambas aplicaciones para capas, frameworks, imports cruzados, aliases, reexportaciones y ciclos; verificar éxito del grafo válido y fallo de un ejemplo negativo en cada aplicación, documentando las reglas antes de construir el shell y servicios técnicos (`local-development`).

## 3. Infraestructura técnica backend — requiere 2.4

- [x] 3.1 Crear entorno validado con Zod, ejemplo backend y separación build/runtime; verificar configuración válida, URI ausente/inválida y diagnóstico sin valores sensibles mediante pruebas unitarias, documentando los campos (`backend-runtime`).
- [x] 3.2 Crear traducción central de errores y bootstrap HTTP; verificar envelopes 503 `CONFIGURATION_ERROR` y 500 `INTERNAL_ERROR`, sin stack ni secretos, con pruebas de controladores y documentación del contrato de error (`backend-runtime`).
- [x] 3.3 Crear conexión Mongoose perezosa, caché por proceso y recuperación de intento fallido; verificar concurrencia y promesa rechazada con dobles, e integración MongoDB con `MONGODB_TEST_URI` aislada mediante `test:integration`, documentando timeouts y ciclo de vida sin modelos de negocio (`backend-runtime`).
- [x] 3.4 Preparar puerto interno y configuración Keycloak inactiva; verificar ausencia de variables, grupo completo y grupo parcial mediante pruebas y documentar que no hay login, verificación real, sesiones ni identidades simuladas (`backend-runtime`).

## 4. Servicios REST y documentación — requiere 3

- [x] 4.1 Crear controlador técnico y Route Handler `GET /api/health`; verificar HTTP 200, JSON `status: ok`, `no-store` y ausencia de llamadas MongoDB/Keycloak con pruebas de handler, documentando su semántica de liveness (`backend-runtime`).
- [x] 4.2 Crear contrato único OpenAPI 3.1.0, `GET /api/openapi`, script `openapi:lint`, Swagger en `GET /api/docs` y preparación local de assets; verificar documento válido, ausencia de dependencias CDN y render de documentación sin páginas React Next.js, documentando rutas (`backend-runtime`).
- [x] 4.3 Configurar `test:http` contra un proceso Next real y verificar salud/contrato/documentación, cabeceras, errores y liveness con MongoDB detenido; verificar 503 de entorno inválido en un proceso/puerto aislado y registrar resultados sin alterar los servicios de desarrollo (`backend-runtime`, `local-development`).

## 5. Shell y comunicación frontend — requiere 2.4 y 4

- [x] 5.1 Crear validación de entorno público, `.env.example` y proxies Vite para `/api` y `/docs-assets/`; verificar bases inválidas, destino host y preservación de prefijos con pruebas de configuración y documentar qué variables son públicas (`frontend-shell`, `local-development`).
- [x] 5.2 Crear cliente fetch reutilizable con timeout/cancelación y adaptación central de errores; verificar éxito, error HTTP no JSON, timeout, cancelación y respuesta malformada con pruebas de transporte, documentando categorías de error (`frontend-shell`).
- [x] 5.3 Crear caso de uso y puerto de consulta de salud, adaptador del módulo `home`, composición y store Zustand de presentación; verificar con dobles carga/éxito/fallo/reintento y compatibilidad del contrato, sin dependencias de React en Application ni persistencia en el store (`frontend-shell`).
- [x] 5.4 Crear tema MUI global, layout, rutas `/`/no encontrada, pantalla provisional y límite de errores de render; verificar estados, reintento y fallback con Testing Library, documentando que no existen aún pantallas de negocio (`frontend-shell`).
- [x] 5.5 Configurar `test:e2e` con Playwright/Chromium y verificar layout a 360/1280 px, navegación, recarga, error/recuperación de API y Swagger por proxy con sus assets; comprobar ausencia de secretos/direcciones privadas en bundle y registrar resultados (`frontend-shell`, `local-development`).

## 6. Contenedores y entorno local — requiere 4 y 5

- [x] 6.1 Crear Dockerfile frontend con targets development/production, `.dockerignore` y plantilla Nginx con fallback SPA y proxies configurables; verificar builds y smoke test local de ambos targets, incluyendo rutas recargadas, `/api/health` y Swagger/assets, documentando `API_UPSTREAM` (`local-development`).
- [x] 6.2 Crear Dockerfile backend con targets development/production, `.dockerignore`, salida standalone y ejecución sin privilegios; verificar builds sin servicios externos y smoke test de health/OpenAPI/Swagger con assets incluidos y runtime configurado, sin desplegar (`backend-runtime`, `local-development`).
- [x] 6.3 Crear Compose de desarrollo y ejemplo de entorno raíz con los tres servicios, healthchecks, red, volúmenes y publicaciones loopback; verificar `docker compose config`, arranque, proxy navegador/API, recarga y persistencia tras `down`/`up`, documentando aislamiento de dependencias Windows/Linux (`local-development`).

## 7. Documentación y aceptación integrada — requiere 3–6

- [x] 7.1 Completar README con prerrequisitos, versiones fijadas, variables, comandos host/Compose, instalación/validación, URLs, diagnóstico, imágenes finales locales y parada sin borrado de datos; verificar el recorrido desde los ejemplos y la distinción de liveness, MongoDB y Keycloak inactivo (`local-development`).
- [x] 7.2 Configurar el script `check` de cada aplicación y ejecutar calidad, compilaciones, OpenAPI, integración y navegador siguiendo el README; verificar independencia y conformidad de los escenarios de las tres capacidades, registrando resultados y cualquier limitación del entorno sin declararla aprobada (`frontend-shell`, `backend-runtime`, `local-development`).
- [x] 7.3 Revisar la evidencia SOLID/DDD/Clean Architecture y el inventario de cambios; verificar que no hay módulos de negocio, login ni despliegue, conservar la propuesta base y ejecutar `openspec validate initialize-foundations --strict --no-interactive` antes de solicitar aceptación del incremento.
