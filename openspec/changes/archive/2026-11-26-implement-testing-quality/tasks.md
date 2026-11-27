# Tasks

## 1. Inventario y matriz de verificación

- [x] 1.1 Crear matriz de suites/comandos backend y frontend indicando configuración, alcance, dependencias externas y exclusiones; verificar cada comando con `package.json`, Vitest/Playwright configs y scripts orquestadores existentes.
- [x] 1.2 Definir disparadores de pruebas por capa y riesgo (dominio, autorización, persistencia, integración, HTTP/OpenAPI, UI/E2E, arquitectura); verificar la matriz contra los requisitos de capacidades activas/archivadas y evitar exigir capas no afectadas.
- [x] 1.3 Documentar que `npm run check` ejecuta lint, tipos, unitarias y arquitectura, pero no integración/HTTP/OpenAPI/build/E2E; verificar que no se describen esos comandos como incluidos en `check`.
- [x] 1.4 Documentar uso seguro de Mongo replica set, bases `_test`, fixtures Keycloak/Playwright, recursos temporales y guardas de limpieza; verificar que cada ejemplo excluye `.env` productivo y datos locales persistentes.

## 2. Evidencia y documentación

- [x] 2.1 Definir plantilla breve para `docs/verification.md` con identificador/fecha del cambio, comandos exactos, entorno, resultados por capa, advertencias, fallos, omisiones y límites; verificarla con una entrada de ejemplo claramente marcada como ilustrativa.
- [x] 2.2 Añadir índice o sección de estado actual sin eliminar registros anteriores; verificar referencias cruzadas y marcar evidencia antigua como histórica si contradice registros posteriores.
- [x] 2.3 Documentar conteos y porcentajes como resultados de una corrida, no como garantía; verificar que no se agreguen gates numéricos sin una decisión aprobada.

## 3. Scripts y preparación para automatización

- [x] 3.1 Verificar que las instrucciones usan los comandos reales para checks, integración preparada, OpenAPI, HTTP, build y E2E; comprobar la sintaxis y configuración sin iniciar servicios o tocar datos ajenos.
- [x] 3.2 Documentar que el repositorio no contiene una política/proveedor CI detectado en este inventario y dejar elección de pipeline/cobertura para cambio separado; verificar que esta propuesta no añade workflows, dependencias o umbrales.

## 4. Aceptación documental

- [x] 4.1 Revisar coherencia entre la guía, scripts y fixtures: cada comando debe existir, las capas excluidas deben declararse y los pasos de limpieza deben limitarse a recursos propios; registrar discrepancias corregidas.
- [x] 4.2 Ejecutar `openspec validate implement-testing-quality --strict`; comprobar que solo se hayan modificado artefactos previstos de OpenSpec/documentación y que no se ejecutaron suites ni builds durante la planificación.

## Workflow follow-up

- Resolver la selección de plataforma CI y gates de cobertura en una propuesta separada si el proyecto decide automatizar la matriz.
- Archivar después de aplicar y revisar la guía actualizada.
