# Tasks

## 1. Dominio y contratos

- [x] 1.1 Crear Invoice, objetos de importe/fecha y normalización de campos según design.md; probar suma exacta, valores límite, origen y vínculos inmutables, documentando reglas comerciales.
- [x] 1.2 Definir casos de uso, paginación, edición, errores y puertos de reloj, política, asignación, autorización y auditoría; verificar dependencias internas con tests de aplicación y comprobación arquitectónica.
- [x] 1.3 Implementar evaluación temporal con revisión y adaptador no disponible; probar dentro/fuera/borde exclusivo, efecto de cambio de política sobre facturas existentes y 503 sin servicio; documentar condición para habilitar edición.

## 2. Flota y autorización

- [x] 2.1 Añadir contrato público de Fleet para hechos y confirmación transaccional de la asignación concreta; probar múltiples relaciones, asignación ajena, cierre/desactivación concurrente y ausencia de acceso directo a colecciones desde Invoices; documentar el contrato.
- [x] 2.2 Implementar matriz de permisos vigente y aislamiento antes de conteos/paginación; probar cuatro roles, acceso por ID, imagen ajena, propietario no elegible y revocación concurrente; actualizar documentación de autorización.

## 3. Persistencia y adjuntos

- [x] 3.1 Preparar inventario solo lectura de datos previos e índices de clave comercial e idempotencia; verificar reporte, bloqueo ante datos incompatibles y carreras por duplicidad en replica set; documentar despliegue y rollback.
- [x] 3.2 Implementar repositorio Mongo, versionado y evento durable atómico; probar rollback, versión obsoleta, reintentos de idéntico contenido, clave reutilizada con contenido distinto y rechazo tras revocación.
- [x] 3.3 Seleccionar y registrar dependencia de validación de imágenes, implementar almacenamiento privado transaccional con límites de tamaño/dimensiones y retirada de metadatos; probar tipos falsos, archivos excesivos, reemplazo fallido y ausencia de huérfanos; documentar almacenamiento.

## 4. REST y OpenAPI

- [x] 4.1 Añadir composición y handlers delgados de alta, listado, detalle, edición e imagen; probar multipart estricto, contexto explícito, metadatos manipulados y lectura binaria autorizada.
- [x] 4.2 Publicar OpenAPI 3.1 con schemas decimales, idempotencia, paginación, multipart y errores incluidos 413/415; verificar openapi:lint y contratos HTTP contra respuestas reales; documentar ejemplos sin datos personales reales.

## 5. Frontend

- [x] 5.1 Implementar contrato y adaptador HTTP de Invoice con validación de respuesta, multipart, errores y cancelación; verificar pruebas de transporte, idempotencia en reintento y ausencia de imports del backend.
- [x] 5.2 Reemplazar marcador de Facturas por listado, filtros, chips, detalle y formulario distribuido según design.md reutilizando componentes de Invitaciones; probar carga, vacío, error, permisos y edición no disponible.
- [x] 5.3 Incorporar imagen con vista previa, recuperación de borrador y protección ante doble envío/contexto obsoleto; verificar limpieza de previews y ausencia de datos del tercero anterior con tests de componentes.
- [x] 5.4 Verificar teclado, foco y distribución a 360/1280 px con pruebas E2E; documentar evidencia y diferencias justificadas respecto a Invitaciones.

## 6. Integración y aceptación

- [x] 6.1 Ejecutar checks, builds y OpenAPI de ambas aplicaciones; registrar resultados en docs/verification.md con comandos reproducibles y límites de la evidencia.
- [x] 6.2 Ejecutar recorrido integral alta con imagen, consulta aislada, rechazo de duplicado, cierre de asignación con historial estable y edición 503 sin Configuration; probar edición con proveedor controlado dentro/fuera/borde sin presentarlo como servicio productivo implementado.

## Comandos previstos

Desde la raíz del proyecto:

```text
openspec validate implement-invoice-management --strict
npm --prefix backend run check
npm --prefix backend run test:integration
npm --prefix backend run openapi:lint
npm --prefix backend run build
npm --prefix frontend run check
npm --prefix frontend run build
npm --prefix frontend run test:e2e
npm --prefix backend run dev
npm --prefix frontend run dev
```

Los comandos de integración requieren una base de prueba aislada con replica set y las variables documentadas del proyecto. Esta propuesta no ejecuta builds, migraciones ni pruebas funcionales de una capacidad todavía inexistente.

## Workflow follow-up

- Revisar y aprobar las decisiones comerciales propuestas antes de aplicar.
- Implementar en openspec/implement-invoice-management desde development y revisar mediante PR.
- Planificar Configuration y lectura QR como cambios independientes; la entrega actual no los acredita.
- Archivar únicamente después de completar y verificar el alcance aprobado.
