# Tasks

## 1. Catálogo y contratos

- [x] 1.1 Crear módulo Configuration y catálogo inicial con 43200 segundos, rango y metadatos inmutables; verificar pruebas de enteros, límites, claves desconocidas y ausencia de frameworks en dominio; documentar catálogo.
- [x] 1.2 Implementar contratos públicos de política efectiva y confirmación, DTO administrativos y reglas de vigencia global; probar UNAVAILABLE por ausencia/invalidez y consumo interno sin parameters:read.

## 2. Persistencia, inicialización y autorización

- [x] 2.1 Implementar inventario solo lectura e índices únicos de parámetros/eventos; probar detección de duplicados, claves desconocidas y valores inválidos en base aislada; documentar preparación de despliegue.
- [x] 2.2 Añadir inicializador explícito parameters:init y comando parameters:inventory; probar instalación de 43200 con evento, repetición sin cambios, preservación de valores modificados y rollback por fallo de auditoría; documentar actor técnico y configuración segura.
- [x] 2.3 Implementar listado/detalle/historial y actualización con versión, autorización global vigente y evento durable en una transacción; probar cuatro roles, permiso revocado, conflicto 409, no-op y fallo parcial; documentar REST y permisos.
- [x] 2.4 Implementar confirmación de revisión mediante fence sobre el mismo documento y sesión del consumidor; probar carreras actualización/confirmación con barreras y reintentos acotados, sin escrituras parciales.

## 3. Integración con Facturas

- [x] 3.1 Añadir adaptadores externos y sustituir lectura/confirmación UNAVAILABLE en bootstrap por contratos de Configuration; verificar ausencia de acceso a colecciones ajenas e imports circulares y documentar mapa de composición.
- [x] 3.2 Reevaluar ventana de Invoice dentro de su transacción con reloj servidor después de confirmar revisión; probar dentro/fuera/borde de 12 horas, agotamiento durante petición, cambio concurrente y reintentos con reloj controlado.
- [x] 3.3 Verificar nueva duración sobre facturas existentes, falta de parámetro con 503 y persistencia del rechazo QR_IMMUTABLE sin consultar política; actualizar docs/invoice-management.md sin declarar completado el cambio QR.

## 4. REST y OpenAPI

- [x] 4.1 Añadir handlers delgados GET listado/detalle/historial y PATCH de valor con contexto global y schemas Zod estrictos; verificar contratos HTTP, errores 400/401/403/404/409/503/500 y ausencia de altas/bajas públicas.
- [x] 4.2 Publicar OpenAPI 3.1 con catálogo, unidad, versiones, paginación e historial; ejecutar openapi:lint y pruebas de correspondencia entre contratos y respuestas.

## 5. Frontend

- [x] 5.1 Añadir contrato y adaptador de parámetros con validación de respuestas, errores y cancelación; probar transporte global, versiones y rechazo de payload inesperado.
- [x] 5.2 Sustituir marcador /parameters por guard global y vistas de listado/detalle/historial con componentes compartidos; probar cuatro roles, carga/vacío/error/éxito y falta de inicialización; documentar distribución.
- [x] 5.3 Implementar diálogo de valor actual/nuevo y equivalencia con aviso de efecto sobre facturas existentes; probar confirmación, rango, no-op, conflicto con borrador recuperable y doble envío.
- [x] 5.4 Verificar limpieza por contexto/permisos y respuestas obsoletas, accesibilidad de teclado/foco y 360/1280 px mediante tests de componentes/E2E; registrar evidencia.

## 6. Verificación integrada

- [x] 6.1 Ejecutar checks, arquitectura, builds, OpenAPI y pruebas Mongo con replica set aislado; registrar resultados reproducibles en docs/verification.md.
- [x] 6.2 Ejecutar recorrido inicialización → lectura → cambio APP_ADMIN → edición MANUAL con nueva duración → consulta de historial; verificar rollback de auditoría, carrera real con factura y QR protegido.

## Comandos verificados

```text
npm --prefix backend run check
npm --prefix backend run test:integration -- --pool=forks --maxWorkers=1 tests/integration/invoice-repository.test.ts tests/integration/configuration-parameters.test.ts
npm --prefix backend run openapi:lint
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend test -- --pool=forks --isolate=false --maxWorkers=1 --reporter=verbose
npm --prefix frontend run test:architecture
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- tests/e2e/parameter-management-responsive.spec.ts --workers=1
openspec validate implement-parameter-management --strict
```

La integración se ejecutó en una replica set Mongo aislada; `parameters:inventory` y `parameters:init` se ejercieron en una base temporal `_test` con `PARAMETERS_INIT_ACTOR` técnico y luego se eliminaron. Ningún comando de inicialización se ejecutó contra la base de `.env.local`. Los resultados reproducibles y advertencias existentes constan en `docs/verification.md`.