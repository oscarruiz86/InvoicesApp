# Design

## Context

Vehicle Management ya consulta `vehicle_assignments` para mostrar el conductor actual y evitar la desactivación insegura de vehículos. Ese lector es deliberadamente defensivo, pero no es propietario de los datos: carece de un modelo de comandos, un ciclo de vida histórico y garantías de unicidad para las asignaciones activas. Driver Management expone datos de elegibilidad, pero su transición de estado todavía no confirma que no haya asignaciones abiertas. En el frontend, `/assignments` solo existe como marcador de ruta.

El cambio debe hacer que Asignaciones sea el propietario de la colección existente, sin romper el contrato de confirmación de Vehicle Management ni conceder a un conductor acceso más allá de su propia relación activa.

## Goals / Non-Goals

**Goals:**

- Crear un agregado pequeño de Assignment con ciclo de vida `ACTIVE` y `CLOSED`, referencias inmutables a los participantes y control optimista de versiones.
- Permitir varias asignaciones activas por vehículo y por conductor, y exigir unicidad solo para cada par activo de tercero, vehículo y conductor, con confirmación en la misma transacción de MongoDB que los datos de auditoría.
- Reutilizar los datos de elegibilidad de Driver y de estado de Vehicle al confirmar, manteniendo los Route Handlers y componentes React limitados a la coordinación.
- Convertir la ruta existente de asignaciones en una vista operativa adaptable y consciente de permisos.
- Hacer que la desactivación de conductores y vehículos use la misma evidencia autoritativa sobre asignaciones activas.

**Non-Goals:**

- Trasladar o editar perfiles, membresías o datos de identidad canónicos de Keycloak.
- Reasignación automática, cierre automático, edición o reapertura de asignaciones, cambios en facturación, notificaciones ni planificación de despachos o rutas.
- Añadir atributos de vehículos o conductores.

## Decisions

### Assignment owns the current collection

El módulo Assignment será propietario de `vehicle_assignments` y conservará ese nombre para que Vehicle Management siga usando una única fuente de verdad. Los documentos contendrán una instantánea inmutable de los participantes (`thirdPartyId`, `vehicleId`, `driverId`, `subject` y nombre visible seguro del conductor), además de `status`, `startedAt`, `endedAt` opcional, `version` y metadatos de auditoría generados por el servidor. En la misma entrega se conservarán o adaptarán los campos que necesita el lector actual.

Alternativas consideradas: una segunda colección dividiría la fuente usada para decidir la desactivación de vehículos; incorporar la asignación dentro del vehículo impediría garantizar la exclusividad del conductor y conservar el historial. Se descartan ambas opciones.

### Close ends only the selected relationship

La API de comandos permitirá crear una asignación `ACTIVE` y cerrar una asignación seleccionada que esté `ACTIVE`. Cada asignación representa un único par conductor-vehículo. Agregar un conductor a un vehículo o un vehículo a un conductor no exige cerrar sus otras relaciones. Para volver a activar un mismo par cerrado, se conserva el cierre anterior y se crea un nuevo registro.

Alternativa considerada: cerrar todas las relaciones de un participante al asignarlo a otro limitaría el modelo a una relación uno a uno y descartaría la cardinalidad muchos a muchos requerida.

### Transactional confirmation and durable uniqueness

Los comandos de creación y cierre se ejecutarán en transacciones de MongoDB. Al confirmar, volverán a leer la autorización y el contexto vigentes, la elegibilidad de Driver, el estado de Vehicle y las versiones esperadas cuando corresponda. Un índice único parcial sobre tercero, vehículo y conductor para asignaciones `ACTIVE` será la última barrera ante una repetición concurrente del mismo par; las carreras que produzcan claves duplicadas se convertirán en errores neutrales 409. Los cambios de estado de Assignment actualizarán la revisión que usan las transiciones de estado de Vehicle y Driver.

Alternativas consideradas: las comprobaciones de lectura y escritura por separado no son suficientes ante solicitudes concurrentes; los bloqueos de aplicación no protegen varias instancias.

### Ports preserve module direction

La capa de aplicación de Assignment dependerá de contratos pequeños de lectura y confirmación para Driver, Vehicle, autorización de Identity y auditoría. El lector de vehículos de Fleet se adaptará para consumir el contrato de lectura del propietario Assignment en vez de interpretar documentos por su cuenta. Los módulos Driver y Vehicle usarán un contrato de confirmación de Assignment al cambiar de estado. Ningún módulo de dominio dependerá de HTTP, React, Mongoose ni Route Handlers.

Alternativa considerada: importar repositorios de otros módulos expondría detalles de persistencia y generaría dependencias circulares.

### API and interface

La API publicará operaciones con alcance para listar, consultar, crear y cerrar asignaciones bajo `/api/assignments`, con `scope=organization&thirdPartyId=...`, autenticación Bearer, paginación, filtros, ordenamiento, cierre versionado y ejemplos y errores documentados en OpenAPI 3.1. Usará los permisos existentes `assignments:read`, `vehicles:assign` y `vehicles:unassign`, sin inventar permisos de escritura para asignaciones. El frontend incorporará un adaptador de API de Assignment, un contrato de aplicación y una vista en `/assignments`. Consultará las API de conductores y vehículos para ofrecer opciones válidas; el backend seguirá siendo la autoridad.

## Risks / Trade-offs

- [Documentos `ACTIVE` malformados o duplicados impiden crear los índices únicos] → inventariarlos y corregirlos mediante una migración controlada antes de habilitar los índices únicos parciales; cancelar el despliegue en vez de descartar historial silenciosamente.
- [Algún consumidor aún espera la forma provisional del documento] → conservar los campos que usa Vehicle Management y probar la compatibilidad en integración antes de cambiar su lector.
- [El entorno MongoDB de destino no admite transacciones con varios documentos] → validar transacciones en un conjunto de réplicas del entorno de despliegue antes de habilitar comandos; de lo contrario, no exponer escrituras.
- [Las transiciones de estado de Driver o Vehicle compiten con las escrituras de asignación] → confirmar estado, elegibilidad, autorización y revisiones dentro de la misma transacción, y rechazar la operación de forma segura si no se puede confirmar.
- [Las listas desactualizadas del frontend muestran participantes que ya no están disponibles] → actualizar las listas después de las mutaciones y mostrar respuestas 409/503 en lugar de anticipar éxito en el cliente.

## Migration Plan

1. Inventariar `vehicle_assignments` para detectar esquemas inválidos, referencias entre terceros y filas `ACTIVE` repetidas para el mismo par de tercero, vehículo y conductor; corregir los hallazgos con una migración auditable y revisada. Varias asignaciones activas de un vehículo o conductor con distintos participantes son válidas.
2. Completar metadatos y versiones del servidor para las filas heredadas válidas, conservando las fechas originales cuando sean confiables; poner en cuarentena las filas inválidas en vez de inventar asignaciones.
3. Crear los índices únicos parciales para asignaciones `ACTIVE` y los índices de lectura; después, desplegar la lectura de Assignment y conservar el comportamiento seguro de confirmación de Vehicle Management.
4. Desplegar juntos los comandos transaccionales, la confirmación para desactivar conductores y la interfaz, la API y OpenAPI.
5. Verificar el estado del servicio, el informe de migración, las pruebas de escrituras concurrentes y los eventos de auditoría en ejecución. Si hace falta, revertir el código de la aplicación; no eliminar datos ni índices automáticamente. Cualquier reversión de datos requiere un plan de restauración revisado por separado.

## Open Questions

Ninguna. El flujo inicial usa fechas UTC generadas por el servidor y exige el cierre explícito, por lo que no hace falta una decisión adicional antes de implementar.
