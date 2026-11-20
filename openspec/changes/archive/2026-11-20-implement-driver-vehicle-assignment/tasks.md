# Implementation Tasks

## 1. Baseline and data preparation

- [x] 1.1 Inventariar los documentos existentes de `vehicle_assignments` para detectar referencias inválidas a participantes, campos malformados y pares duplicados de vehículo/conductor en estado `ACTIVE`; documentar el resultado de la revisión y las medidas correctivas acordadas.
- [x] 1.2 Definir y probar la migración reversible y la normalización de filas heredadas válidas, incluido el manejo de fechas/versiones y el informe de cuarentena para filas inválidas.
- [x] 1.3 Confirmar que MongoDB admite transacciones en las topologías de desarrollo y despliegue previstas antes de habilitar escrituras de asignaciones.

## 2. Domain and application

- [x] 2.1 Añadir el agregado Assignment, un ciclo de vida inmutable de estados `ACTIVE`/`CLOSED`, normalización, versionado y pruebas de dominio para las transiciones y el cierre idempotente.
- [x] 2.2 Definir comandos de aplicación, vistas, clasificación de errores, paginación/filtros/ordenamiento y contratos para repositorios, autorización, elegibilidad de Driver, datos de Vehicle y auditoría.
- [x] 2.3 Añadir el contrato de confirmación de Assignment que necesitan las transiciones de estado de Driver y Vehicle; mantener las dependencias dirigidas hacia los contratos de dominio y aplicación.
- [x] 2.4 Implementar reglas de autorización y alcance con `assignments:read`, `vehicles:assign` y `vehicles:unassign`, incluidos resultados neutros de no encontrado y sin acceso implícito para `APP_ADMIN`/`COMPANY_ADMIN`.

## 3. Persistence and transactional integration

- [x] 3.1 Implementar el repositorio MongoDB de Assignment sobre `vehicle_assignments`, conservar los campos compatibles y crear los índices de lectura y el índice único parcial para cada par activo de tercero, vehículo y conductor.
- [x] 3.2 Implementar la confirmación transaccional de creación/cierre con autorización y contexto vigentes, elegibilidad del conductor, estado del vehículo, versiones y eventos de auditoría durables.
- [x] 3.3 Reemplazar el decodificador provisional de documentos de Vehicle Management por los contratos de lectura/confirmación propiedad de Assignment, sin relajar el comportamiento de rechazo seguro.
- [x] 3.4 Ampliar la desactivación de Driver para confirmar que no haya asignaciones `ACTIVE`; convertir evidencia de una asignación activa en 409 y la falta de disponibilidad de evidencia en 503.
- [x] 3.5 Añadir pruebas unitarias, de repositorio y de integración para carreras por claves duplicadas, intentos entre terceros, carreras de transiciones de estado, reversiones y fallos de auditoría.

## 4. REST, OpenAPI and frontend

- [x] 4.1 Añadir Route Handlers autenticados para listar, consultar, crear y cerrar asignaciones; mantener las reglas de negocio fuera de los handlers.
- [x] 4.2 Publicar y validar esquemas OpenAPI 3.1, seguridad Bearer, contexto explícito del tercero y respuestas 400/401/403/404/409/503/500.
- [x] 4.3 Añadir contratos de Assignment en el frontend y un adaptador HTTP reutilizable con cancelación, protección por generación de contexto y errores normalizados.
- [x] 4.4 Reemplazar el marcador `/assignments` por una experiencia adaptable para listar, consultar, crear y cerrar asignaciones, gobernada por los permisos y el contexto vigentes.
- [x] 4.5 Añadir pruebas de frontend para estados vacío/cargando/error/denegado/conflicto, el cierre explícito de una relación y accesibilidad en pantallas de 360/1280 px.

## 5. Verification and documentation

- [x] 5.1 Actualizar la documentación de arquitectura, autorización y Fleet sobre propiedad de datos, ciclo de vida, migración, desactivación y límites respecto a Keycloak.
- [x] 5.2 Ejecutar formato, verificación de tipos, suites unitarias/de integración, validación OpenAPI y compilaciones de producción de backend y frontend.
- [x] 5.3 Realizar una prueba de humo integral que cubra la creación de relaciones, consultas de Driver y Vehicle, bloqueo de desactivación, cierre de una relación y verificación de auditoría.

## 6. Many-to-many relationship correction

- [x] 6.1 Actualizar inventario y migración para permitir varias asignaciones activas por vehículo o conductor y poner en cuarentena solo pares activos duplicados; verificar los casos de migración.
- [x] 6.2 Sustituir los índices únicos por participante por un índice único parcial del par activo y retirar los índices restrictivos anteriores; verificar carreras para pares iguales y distintos.
- [x] 6.3 Mostrar en los selectores todos los conductores y vehículos activos elegibles y validar únicamente la repetición del par; verificar el estado duplicado y las opciones disponibles.
- [x] 6.4 Actualizar vistas de Vehicle, contrato OpenAPI y documentación para representar varios conductores activos por vehículo; validar el contrato y las referencias.
- [x] 6.5 Ejecutar verificaciones de backend y frontend y el smoke test integral con varios conductores por vehículo y varios vehículos por conductor.
