# Tasks

## 1. Límites y compatibilidad del dominio

- [x] 1.1 Crear el agregado y DTOs puros `ThirdParty` en Organizations, con NIT, contacto, estado, versión y normalización, y verificar pruebas unitarias de entradas válidas, nulas y rechazadas.
- [x] 1.2 Definir puertos de aplicación y contratos de resultado para crear, listar, obtener, editar, cambiar estado global y administrar relaciones; verificar que Domain/Application no importan Mongoose, Next ni Presentation mediante la comprobación arquitectónica.
- [x] 1.3 Documentar y aplicar la separación entre perfil administrativo del tercero y perfil personal Keycloak: APP_ADMIN, COMPANY_ADMIN relacionado y THIRD_PARTY_ADMIN propio editan solo el primero; verificar que ninguna ruta de este módulo modifica atributos personales de Keycloak.
- [x] 1.4 Ajustar el techo de grants para habilitar `third-parties:*` global a APP_ADMIN, conservar los límites de COMPANY_ADMIN y THIRD_PARTY_ADMIN y negar DRIVER; verificar la matriz con pruebas de autorización por rol y scope.

## 2. Persistencia, migración y consistencia

- [x] 2.1 Implementar el modelo MongoDB `third_parties`, sus índices de unicidad y consulta, y mapeadores estrictos; verificar con MongoDB real que NIT duplicado, incluso inactivo, devuelve conflicto.
- [x] 2.2 Extender de forma aditiva `company_third_party_relations` con versión, fecha y campos técnicos de coordinación compatibles con documentos existentes; verificar que el índice único de la pareja sigue impidiendo duplicados.
- [x] 2.3 Implementar el repositorio transaccional de terceros y su proyección `organizations`; verificar rollback cuando falle cada escritura participante sin dejar tercero, relación o proyección parcial.
- [x] 2.4 Implementar consultas paginadas y ordenadas que apliquen ámbito antes de filtros, conteo y página; verificar que un tercero ajeno no aparece ni altera el total.
- [x] 2.5 Preparar un inventario/migración idempotente de organizaciones THIRD_PARTY legadas sin inventar NIT, correo ni relaciones, y verificar dos ejecuciones sobre fixtures con datos completos e incompletos.
- [x] 2.6 Configurar y comprobar el replica set de desarrollo/pruebas necesario para transacciones, documentando el procedimiento sin borrar volúmenes; verificar una transacción real contra una base `_test`.

## 3. Casos de uso y concurrencia

- [x] 3.1 Implementar creación de tercero con su relación inicial y auditoría durable dentro de una confirmación; verificar alta autorizada, validación, conflicto de identificación y evento único.
- [x] 3.2 Implementar detalle, edición con versión y estado global del tercero; verificar no-op, conflicto de versión, conservación de metadatos, restricción del cambio global a APP_ADMIN y ausencia de mutación del perfil Keycloak de un THIRD_PARTY_ADMIN.
- [x] 3.3 Implementar creación, reactivación y desactivación de una relación empresa-tercero como transiciones independientes; verificar que una desvinculación no altera relaciones de otras empresas ni el perfil canónico.
- [x] 3.4 Revalidar política, evidencia organizacional y relación dentro de cada transacción antes del commit; verificar con barreras de concurrencia que una revocación de permiso o relación impide una escritura basada en evidencia obsoleta.
- [x] 3.5 Registrar eventos append-only de creación, edición y transiciones de tercero/relación con actor, scope, correlación y cambios permitidos; verificar que no contiene tokens, credenciales ni payloads completos y que un reintento no duplica el evento.

## 4. REST, OpenAPI e integración con organizaciones

- [x] 4.1 Implementar validadores Zod, controladores y Route Handlers delgados para `/api/third-parties` y sus recursos; verificar 400, 401, 403, 404, 409, 503 y 500 con envelopes JSON/no-store coherentes.
- [x] 4.2 Implementar endpoints de relación con scope y versión explícitos; verificar que COMPANY_ADMIN solo cambia la pareja de su empresa y APP_ADMIN solo cambia estado global desde GLOBAL.
- [x] 4.3 Actualizar OpenAPI 3.1 y Swagger con esquemas, Bearer, scopes, ejemplos y errores reales; verificar contrato contra respuestas HTTP de un servidor standalone.
- [x] 4.4 Sustituir el lookup de terceros de invitaciones por un puerto de consulta limitado a la empresa solicitante; verificar que no expone terceros de otras empresas y conserva la búsqueda del selector existente.
- [x] 4.5 Revalidar tercero y relación en creación, reenvío, aceptación, roles y reactivación de invitaciones/memberships; verificar que una relación desactivada impide crear o restaurar acceso pero conserva consulta histórica autorizada.
- [x] 4.6 Mantener la semántica del contexto directo de tercero: desactivar el tercero lo invalida y desactivar solo una relación no; verificar resolución de contexto antes y después de ambas transiciones.

## 5. Frontend y experiencia administrativa

- [x] 5.1 Crear `frontend/src/modules/third-party-management` con contratos de aplicación, adaptador HTTP validado y manejo centralizado de errores; verificar pruebas de adaptador para éxito, error no JSON, timeout y respuesta malformada.
- [x] 5.2 Implementar listado con búsqueda, filtros, paginación y estados de carga/vacío/error, limitado al scope confirmado; verificar que cambiar de contexto cancela o descarta respuestas previas.
- [x] 5.3 Implementar formulario de creación y edición con validación de campos, control de versión y mensajes de conflicto; verificar que cancelar no escribe y que un 409 exige recarga antes de reintentar.
- [x] 5.4 Implementar detalle y gestión de relaciones con confirmaciones explícitas de activar/desactivar; verificar que la interfaz distingue estado global de tercero y estado de la relación de la empresa.
- [x] 5.5 Registrar rutas, guards y navegación Terceros dentro de Administración, incluyendo acceso global cuando corresponda; verificar menú, ruta directa denegada y limpieza de datos tras cambio de contexto.
- [x] 5.6 Reutilizar el selector de terceros del nuevo módulo en invitaciones y memberships; verificar con pruebas de interfaz que solo muestra resultados autorizados y conserva accesibilidad con teclado.
- [x] 5.7 Validar formularios, tablas, diálogos y navegación a 360 px y 1280 px; verificar foco visible, etiquetas, avisos no bloqueantes y ausencia de desbordamiento horizontal.

## 6. Verificación integrada y documentación

- [x] 6.1 Actualizar README y documentación de arquitectura/runtime con modelo de tercero, estados, relación many-to-many, perfiles administrativos frente a perfiles personales Keycloak, migración y procedimientos de prueba; verificar que los comandos documentados se ejecutan sin cambios.
- [x] 6.2 Ejecutar typecheck, lint, pruebas unitarias y comprobación de dependencias arquitectónicas en frontend y backend; verificar que ambos proyectos pasan sin conexiones externas en las suites correspondientes.
- [x] 6.3 Ejecutar integración MongoDB, pruebas HTTP/OpenAPI y navegador contra servicios preparados; verificar aislamiento por empresa, concurrencia, auditoría, invitaciones, contextos y flujos responsive.
- [x] 6.4 Registrar resultados, limitaciones y cualquier dato legado sin perfil reconciliado en `docs/verification.md`; verificar que no se declaran desplegados módulos de flota, facturas ni cambios de alcance.

## Workflow follow-up

- Implementar desde la rama `openspec/implement-third-party-management` creada desde `development` y abrir un pull request hacia `development` después de revisión aprobada.
- Archivar el cambio únicamente cuando todas las tareas estén completas, sus specs se hayan sincronizado y se satisfagan los requisitos de revisión del proyecto.
