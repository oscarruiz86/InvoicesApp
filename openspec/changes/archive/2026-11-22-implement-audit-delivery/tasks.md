# Tareas (Tasks)

## 1. Contrato público de Audit

- [x] 1.1 Definir el tipo de evento normalizado y el saneador/validador estricto; las pruebas unitarias rechazan campos inseguros o desconocidos y aceptan hechos válidos de seguridad y organización.
- [x] 1.2 Documentar el contrato de productores, los IDs de evento estables, las categorías, los campos seguros de contexto/recurso y la regla de que el historial de auditoría no es legible sin una política de consulta aprobada.

## 2. Registro durable y retención

- [x] 2.1 Implementar el escritor Audit de MongoDB con IDs de evento únicos, semántica de inserción inmutable y detección de conflictos; las pruebas de integración verifican que las entregas repetidas creen un único registro y que el uso conflictivo del mismo ID preserve el original.
- [x] 2.2 Añadir de forma idempotente la fecha de expiración a dos años calendario y el índice TTL; las pruebas aisladas de MongoDB verifican el cálculo de límites en años bisiestos, las opciones del índice y la preservación de registros no vencidos.
- [x] 2.3 Documentar el comportamiento de eliminación asíncrona TTL de MongoDB, la configuración operativa de índices, el alcance de las copias de seguridad y la regla de retención de dos años.

## 3. Integraciones síncronas de productores

- [x] 3.1 Canalizar los hechos de auditoría de asociaciones/contexto organizacional por el contrato público de Audit usando la transacción del productor; las pruebas de integración MongoDB verifican que el hecho de auditoría se confirme o revierta junto con la mutación organizacional y no contenga IDs ni payloads sin validar.
- [x] 3.2 Canalizar las denegaciones de autorización al escritor Audit depurado preservando la semántica de denegación de mejor esfuerzo; las pruebas verifican que un fallo al escribir auditoría nunca convierta una denegación en una respuesta permitida.

## 4. Entrega recuperable de eventos de política

- [x] 4.1 Implementar un worker acotado de outbox de políticas que escriba los eventos capturados en Audit antes de confirmar el ID de evento correspondiente; las pruebas unitarias cubren espera incremental, lotes acotados y apagado ordenado.
- [x] 4.2 Verificar la recuperación con MongoDB real después de una interrupción entre la inserción en Audit y la confirmación del outbox, incluidos la supresión de duplicados, la identidad de evento sin cambios, el reintento conservado si falla el destino y el registro de conteos sin contenido de eventos.
- [x] 4.3 Añadir el comando del worker y las instrucciones operativas para inicio, monitoreo de conteos, reinicio/recuperación y el comportamiento existente de capacidad del outbox.

## 5. Aceptación integrada

- [x] 5.1 Ejecutar las verificaciones del backend, la integración aislada de MongoDB y la validación estricta de OpenSpec; reconciliar el contrato compartido de Audit con el cambio independiente de ingesta de eventos de Keycloak sin añadir una API de historial ni habilitar `audit:read`.
