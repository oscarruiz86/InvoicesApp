# Design

## Context

Véase [proposal.md](proposal.md) y [specs/testing-quality/spec.md](specs/testing-quality/spec.md). Backend y frontend ya ofrecen `check` (ESLint, TypeScript, Vitest unitario y `test:architecture`). Backend además tiene `test:integration`, HTTP, OpenAPI y build; frontend tiene Playwright, incluido un config específico offline y un harness preparado. Integraciones preparadas y E2E combinados se orquestan por scripts del proyecto. MongoDB de integración necesita replica set. Los checks de arquitectura usan dependency-cruiser y fixtures negativos temporales.

No se encontró configuración de CI en los formatos de pipeline consultados ni scripts/paquetes de cobertura. `docs/verification.md` mezcla registros históricos con resultados por incremento, incluidos fallos, omisiones y restricciones distintas; los documentos de progreso también pueden conservar un estado anterior a verificaciones posteriores.

## Goals / Non-Goals

**Goals:** aclarar los niveles de evidencia y sus comandos, vincular cambios con suites focales, proteger recursos persistentes de prueba y estandarizar reportes verificables sin duplicar las reglas de aceptación de cada módulo.

**Non-Goals:** añadir pruebas o dependencias como parte de la propuesta, definir un umbral numérico de cobertura, hacer que cada cambio ejecute todas las suites, seleccionar un proveedor CI, crear un pipeline o alterar criterios funcionales de negocio.

## Decisions

### Tres niveles acumulables de evidencia

Documentar (1) check local por aplicación para lint/tipos/unitarias/arquitectura; (2) integración focal para persistencia/transacciones/proveedores; y (3) aceptación de superficie para HTTP, OpenAPI, builds y E2E que correspondan. Usar `openapi:check` donde se necesiten lint y cobertura de rutas; no llamar “check completo” a `npm run check`, que actualmente no ejecuta integración ni las otras suites.

**Alternativa considerada:** un único script que ejecute todo en cada cambio. Se descarta porque muchas verificaciones requieren Mongo replica set, Keycloak, contenedores o browser y prolongarían cambios unitarios sin mejorar la selección por riesgo.

### Matriz de cambio, riesgo y comando

Crear una guía corta con disparadores por capa (dominio/aplicación, repositorio Mongo, autorización, REST/OpenAPI, UI y E2E). Reutilizar los scripts focales y harnesses preparados que ya existen; si una capa no se modifica, no exigir su suite sin una dependencia concreta. Las nuevas necesidades de prueba se agregan junto a la capacidad que las requiere.

**Alternativa considerada:** una suite universal de regresión indiferenciada. Se descarta porque oculta qué riesgo valida cada test y ya hay pruebas preparadas para ciertos dominios con servicio real.

### Aislamiento como condición de seguridad

Documentar la topología de replica set y los prefijos/sufijos de base de prueba ya usados; mantener fixtures de Keycloak y contenedores descartables. La limpieza requiere referencia al nombre aleatorio propio y guardas antes de borrar. Ninguna guía de calidad debe sugerir inventarios/migraciones operativas como validación rutinaria.

**Alternativa considerada:** reutilizar los servicios o bases locales permanentes. Se descarta porque pruebas transaccionales y limpiezas podrían tocar datos que no pertenecen a la ejecución.

### Reporte incremental sin reescribir historia

Conservar los reportes históricos como registros fechados. Agregar una forma canónica de registrar cada cambio: commit/fecha o identificador, comandos, entorno, resultado por suite, fallos/advertencias, omisiones y límites. Si un documento de progreso antiguo contradice evidencia posterior, señalarlo como histórico y enlazar el registro más reciente, sin borrar el hecho original.

**Alternativa considerada:** comprimir el documento eliminando resultados viejos. Se descarta porque perdería contexto de regresiones y decisiones ya verificadas.

### CI y cobertura quedan fuera

No crear pipeline ni porcentaje de cobertura mientras no haya proveedor CI o política aprobada. La guía puede separar comandos para que sean reutilizables en automatización posterior; elegir plataforma y gates será un cambio explícito posterior.

## Risks / Trade-offs

- [La matriz puede quedar desactualizada al agregar scripts] → Mantener referencias a comandos reales y revisarla junto con cambios de scripts/configuración.
- [Muchos resultados históricos dificultan encontrar el estado actual] → Añadir índice/sección actual al inicio y etiquetar el resto por fecha/cambio.
- [Una suite externa puede no estar disponible] → Registrar el motivo y el riesgo que queda sin cubrir; no sustituir servicio real por dobles cuando se pretende demostrar integración.
- [El número de pruebas cambia por incremento] → Evitar fijar conteos o porcentajes como garantía; registrar resultados observados en la corrida concreta.

## Migration Plan

No requiere migrar código, tests ni datos. Documentar primero el mapa de comandos y el estado actual observado; actualizar después la guía de selección y la plantilla de evidencia. Mantener las entradas históricas y añadir etiquetas/enlaces cuando estén desfasadas. Verificar los comandos de forma estática contra `package.json` y scripts; la aplicación de esta propuesta ejecutará los checks afectados como parte de su implementación, aunque esta fase de planificación no ejecuta pruebas.

## Open Questions

La elección de proveedor CI y cualquier gate automático de cobertura quedan para una propuesta futura; no bloquean esta guía ni cambian su alcance.
