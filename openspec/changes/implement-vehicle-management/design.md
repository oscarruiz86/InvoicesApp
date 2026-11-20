# Design

## Context

Ver proposal.md. Fleet backend implementa Driver y DriverFactsReader, pero no Vehicle ni Assignments. El frontend ya separa DriverApi y VehicleApi; VehicleDto solo incluye placa, estado y conductor actual, y updateVehicle solo admite placa. Deben añadirse número interno y tarjeta, alta y detalle. Los grants de vehículos ya existen; no se resembra la política.

## Goals / Non-Goals

Goals: agregado Vehicle independiente dentro de Fleet, consistencia transaccional con autoridad organizacional, ficha mínima y adaptación del frontend existente.

Non-Goals: CRUD de asignaciones, transferencias de propietario, facturas, atributos adicionales, perfiles o navegación de edición Keycloak. No se añade otro bounded context ni un repositorio CRUD universal.

## Decisions

### Modelo y validación

Backend `modules/fleet/{domain,application,infrastructure,presentation}` incorpora Vehicle y sus puertos. Frontend conserva `modules/fleet` y añade Domain/Infrastructure para vehículos, sin crear un módulo paralelo duplicado. Domain/Application no importan React, Next.js, Zod ni Mongoose.

Campos editables: plate, internalNumber y propertyCardNumber. Los tres son cadenas obligatorias; trim y mayúsculas ASCII en servidor. Placa: 3–10 caracteres A-Z/0-9, sin espacios ni separadores. Número interno: 1–40 caracteres A-Z/0-9 y guion. Tarjeta: 1–64 caracteres A-Z/0-9 y guion; es un identificador textual, no carga de archivo. Se preservan ceros iniciales. Estas son reglas de producto propuestas, no afirmaciones regulatorias. Se rechaza entrada desconocida.

Metadatos: id ObjectId opaco, thirdPartyId obtenido del contexto autorizado, status ACTIVE/INACTIVE, version entera positiva, createdAt/updatedAt UTC, createdBy y updatedBy. Identidad del actor viene del JWT validado; propietario es inmutable.

### Unicidad

Índices únicos globales de plate y propertyCardNumber; índice compuesto thirdPartyId/internalNumber, sin filtros de estado. Reservar también valores de vehículos inactivos evita duplicados y reactivaciones ambiguas. Se descarta unicidad global de número interno porque pertenece a la numeración de cada tercero. Conflictos devuelven 409 VEHICLE_IDENTIFIER_CONFLICT sin datos del registro encontrado; los índices arbitran las carreras, no una consulta previa aislada.

### Contrato HTTP

GET /api/vehicles y GET /api/vehicles/:id; POST /api/vehicles; PATCH /api/vehicles/:id; PATCH /api/vehicles/:id/status. Todas requieren scope=organization y thirdPartyId válido, sin companyId, scope self/global ni duplicados. Listado admite page (1+), pageSize (1–100, defecto 20), q (1–100), status y sort plate/internalNumber/propertyCardNumber/status/createdAt con direction asc/desc y desempate por id. Búsqueda literal escapada sobre los tres campos; filtro, conteo y orden se aplican antes de paginar.

POST recibe únicamente los tres campos y responde 201 con Location. PATCH recibe expectedVersion y changes cerrado, no vacío, de esos campos. Estado recibe expectedVersion y status. Respuestas 200 restantes, envelopes JSON no-store, Bearer y WWW-Authenticate en 401; errores 400 INVALID_REQUEST, 403 FORBIDDEN, 404 RESOURCE_NOT_FOUND, 409 VEHICLE_VERSION_CONFLICT/VEHICLE_IDENTIFIER_CONFLICT/VEHICLE_HAS_OPEN_ASSIGNMENT, 503 AUTHORIZATION_UNAVAILABLE o VEHICLE_STORAGE_UNAVAILABLE y 500 seguro.

### Autoridad, historial y concurrencia

Usar grants efectivos y evidencia organizacional actual; nunca decidir por roles organizacionales del token ni por actor.permissions. THIRD_PARTY_ADMIN exige el permiso vehicles:create/read/update/deactivate correspondiente; activar reutiliza vehicles:deactivate. APP_ADMIN/COMPANY_ADMIN solo acceden si tienen otra capacidad completa autorizada en ese tercero.

Toda mutación confirma en transacción MongoDB la versión de política, membership/asociación del actor, tercero activo, versión del vehículo e historial local duradero. Reutilizar coordinación/fences mediante puertos públicos y composición bootstrap, sin acceso entre infraestructuras desde Application. Repetir valores con expectedVersion vigente no cambia versión ni evento. Una revocación o fallo de historial aborta la transición. Audit transversal continúa pendiente.

### Asignaciones y desactivación

Definir AssignmentAccessReader que distingue evidencia confirmada (con revisión) de indisponibilidad. DRIVER necesita Vehicle ACTIVE, DriverFactsReader elegible y asignación propia activa del mismo tercero; filtrar antes de conteo/paginación. currentDriver procede únicamente de ese proveedor. Hasta existir un proveedor real, DRIVER devuelve 503 y currentDriver es null con assignmentState UNAVAILABLE, sin fabricar una asignación.

La desactivación exige evidencia confirmada de ausencia de asignación abierta, coordinada atómicamente con el escritor de asignaciones. Mientras falte el proveedor real, esa transición devuelve 503: no se presume que no hay asignaciones. Se implementan y prueban puertos con dobles, pero la aceptación de integración real queda pendiente del cambio de asignaciones. Alta, lectura y edición administrativas sí funcionan independientemente. Un estado INACTIVE preexistente puede reactivarse con autoridad y versión vigentes; no restaura asignaciones.

Transferencia de tercero se difiere al cambio de asignaciones porque requiere autoridad sobre origen/destino y cierre temporal que no está implementado. No hay endpoint de transferencia ni thirdPartyId editable. Facturas y referencias históricas nunca se reescriben. La prevención de doble asignación y la coordinación con desactivación serán invariantes del futuro escritor, no garantías acreditadas con dobles de este incremento.

### UI y compatibilidad

Extender VehicleApi/VehicleDto, transporte protegido con rutas cerradas, alta/detalle/edición y los tres campos visibles. Reutilizar tablas, paginación, avisos y confirmaciones existentes; permisos por acción y guard de tercero. Limpiar formularios y datos al cambiar contexto, cancelar peticiones y descartar generaciones anteriores. Mostrar conductor vigente solo con evidencia y distinguir falta de información de ausencia de asignación. No crear botones de asignar, transferir ni editar conductor. Mantener DriverApi y sus pruebas.

## Risks / Trade-offs

- [Desactivación depende de Assignments] → fail-closed 503 explícito; la revisión debe aceptar esta limitación hasta disponer del proveedor real.
- [Unicidad global revela que un identificador está ocupado] → conflicto genérico sin propietario ni datos; no hay consulta pública de existencia.
- [Formato de placa demasiado limitado para futuros tipos] → reglas acotadas propuestas arriba; ampliar exige revisión funcional, no relajación silenciosa.
- [Cambios activos de autorización/contexto] → reutilizar contratos vigentes y no completar sus tareas pendientes por inferencia.

## Migration Plan

No se observaron modelos backend de vehículos. Antes de crear índices, ejecutar inventario de cualquier colección preexistente en el entorno de destino. Si hay datos, reportar campos faltantes y duplicados, bloquear habilitación hasta reconciliación explícita y nunca inventar tarjeta o número interno. Ensayar índices e inventario en una base _test. Desplegar API/UI tras verificaciones; rollback retira rutas/composición y conserva documentos e historial. Implementar en openspec/implement-vehicle-management desde development, con PR a development.
