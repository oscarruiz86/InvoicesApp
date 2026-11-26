# Tasks

## 1. Contrato central y cobertura

- [x] 1.1 Inventariar acciones mutables y eventos persistidos por cada módulo cubierto, vinculando acción, actor, correlación, recurso, ámbito, ID y origen central; verificar que la matriz concuerde con las especificaciones aprobadas y no incluya operaciones no confirmadas.
- [x] 1.2 Ampliar el contrato de Audit con orígenes y acciones controlados por dominio; verificar con pruebas unitarias que los productores actuales sigan siendo válidos y que orígenes/acciones desconocidos, campos extra y valores sensibles se rechacen.
- [x] 1.3 Adaptar el escritor compartido para recibir eventos nuevos con la sesión de la transacción cuando aplique; verificar idempotencia, conflicto por ID reutilizado, rollback transaccional, retención TTL existente y persistencia durable fuera de sesión.
- [x] 1.4 Documentar el catálogo de fuentes, acciones, datos permitidos y semántica de `eventId`; verificar mediante pruebas de contrato que cada mapper genera eventos normalizados sin payloads ni datos personales completos.

## 2. Capturas pendientes de Organizations

- [x] 2.1 Confirmar que no se requiere backfill por encontrarse el proyecto en desarrollo sin datos históricos que migrar; verificar que el procedimiento no modifica colecciones locales preexistentes.
- [x] 2.2 Implementar worker acotado e idempotente para nuevas capturas de Company y Third Party; verificar con fixtures `_test` reintentos, interrupción antes/después del write central, ack solo tras aceptación y conservación de capturas inválidas.
- [x] 2.3 Conectar las nuevas mutaciones de Company y Third Party al mismo outbox durable; verificar con integración Mongo que mutación y captura local confirman o revierten juntas y que cada captura entregada aparece una sola vez en Audit.
- [x] 2.4 Conectar invitaciones, membresías, asociaciones y contexto organizacional al contrato compartido sin duplicar las rutas ya integradas; verificar eventos de ciclo de vida y ausencia de tokens, hashes/enlaces de invitación y payloads.
- [x] 2.5 Documentar arranque, métricas, recuperación, tratamiento de captura inválida y rollback del worker; verificar comandos operativos en una base `_test` aislada.

## 3. Integración de Fleet

- [x] 3.1 Conectar eventos de Driver, Vehicle y Assignment al journal compartido con sus transacciones existentes; verificar en integración que cada mutación confirmada comparte su `eventId` con la línea local y que un fallo de Audit revierte la mutación.
- [x] 3.2 Añadir pruebas de sanitización, aislamiento por tercero y denegaciones pertinentes para Fleet; verificar que eventos ajenos, IDs sin validar y datos de perfil no se filtren al journal.
- [x] 3.3 Documentar el mapeo de ciclo de vida y compatibilidad con historiales locales; verificar que las consultas actuales conservan orden, resultados y permisos.

## 4. Integración de Invoices e Invoice Sync

- [x] 4.1 Conectar creación, edición y cambios auditables de factura al journal dentro de la sesión transaccional existente; verificar origen MANUAL/QR, cambios permitidos, idempotencia y rollback ante fallo de captura.
- [x] 4.2 Conectar decisiones administrativas y de resolución de envíos offline mediante su evento durable o transacción propietaria; verificar reintentos y que imagen, QR completo, CUFE/URL sensibles y contenido de factura no se copien al evento central.
- [x] 4.3 Documentar la relación entre evidencia central y eventos locales de factura/sincronización; verificar que listado, detalle e historial de envío no cambien contrato ni autorización.

## 5. Integración de Configuration y catálogos

- [x] 5.1 Conectar cambios efectivos de parámetros al journal central conservando el evento local tipado con valor anterior/nuevo; verificar atomicidad, versiones y que el journal no reciba valores distintos de los permitidos por el mapeo.
- [x] 5.2 Conectar creación, edición y desactivación lógica de catálogos con su transacción existente; verificar actor, acción, recurso, versión y exclusión de datos no necesarios.
- [x] 5.3 Documentar retención y separación de registros locales frente al journal común; verificar que sus endpoints de consulta continúen disponibles con las mismas reglas.

## 6. Aceptación integrada

- [x] 6.1 Ejecutar pruebas unitarias e integración para todos los productores, incluidos MongoDB con replica set de prueba, carreras, fallos, recuperación de outbox y reintentos; registrar comandos y resultados reproducibles en `docs/verification.md`.
- [x] 6.2 Verificar cobertura de cada fila de la matriz de acciones contra el journal y confirmar que no existen eventos de éxito para mutaciones revertidas, IDs duplicados ni datos sensibles.
- [x] 6.3 Validar aislamiento del endpoint y permisos: confirmar que no existe lectura transversal, que `audit:read` sigue sin concederse y que no se agregaron rutas o pantallas de consulta.
- [x] 6.4 Ejecutar `openspec validate implement-audit-logging --strict` y los checks/builds afectados; reconciliar la matriz de cobertura con las especificaciones finales y registrar las limitaciones de evidencia.

## Workflow follow-up

- Crear la rama `openspec/implement-audit-logging` desde `development` y dirigir el PR a `development`, siguiendo el flujo protegido del repositorio.
- Archivar la propuesta únicamente después de implementar y revisar las tareas aprobadas.
