# Gestión de vehículos

Fleet administra placa (`plate`), número interno (`internalNumber`) y número de tarjeta de propiedad (`propertyCardNumber`). Los tres campos son texto obligatorio: se recortan extremos y se convierten letras ASCII a mayúsculas; se conservan ceros iniciales. La placa sigue el formato colombiano de tres letras y dos o tres números, sin separadores (por ejemplo `ABC123` o `ABC12`); número interno admite 1–40 letras/números/guion; tarjeta 1–64 letras/números/guion. La tarjeta es un identificador, no un archivo.

Placa y tarjeta son únicas globalmente, también en registros inactivos. Número interno es único por tercero. MongoDB arbitra carreras mediante índices únicos. Un conflicto devuelve `409 VEHICLE_IDENTIFIER_CONFLICT` sin identificar al registro ni a su propietario.

## API y autoridad

GET/POST `/api/vehicles`, GET/PATCH `/api/vehicles/:id` y PATCH `/api/vehicles/:id/status` requieren Bearer y `scope=organization&thirdPartyId=<ObjectId>`. No admiten companyId, parámetros desconocidos o repetidos. Los cuerpos son cerrados. Alta recibe los tres campos; edición recibe `expectedVersion` y `changes` no vacío; estado recibe `expectedVersion` y `status`. Alta responde 201 y Location; las demás 200; todas las respuestas usan no-store. OpenAPI 3.1 publica las formas y los errores reales.

Listado admite page 1–1000000, pageSize 1–100 (20 por defecto), q literal 1–100, status, sort (plate/internalNumber/propertyCardNumber/status/createdAt) y direction asc/desc. Filtros y conteos preceden paginación; id desempata el orden. Permisos: vehicles:create/read/update/deactivate, con deactivate también para reactivar. No se crean grants ni dependencias adicionales.

Las capacidades organizacionales actuales determinan el acceso. THIRD_PARTY_ADMIN requiere el permiso correspondiente en su tercero activo. DRIVER requiere permiso, conductor elegible y asignación activa propia del mismo tercero; se filtra antes de contar/paginar. APP_ADMIN/COMPANY_ADMIN no tienen acceso operativo implícito; una identidad con capacidad administrativa completa en el tercero puede usarla aunque tenga otros roles. El JWT identifica al actor; sus roles locales y actor.permissions no deciden autoridad de vehículos. Sin permiso se responde 403 antes de consultar existencia; ajeno e inexistente devuelven el mismo 404.

Las mutaciones confirman política, membership, asociación y tercero activos dentro de la transacción MongoDB, coordinados mediante fences y puertos inyectados en bootstrap. Vehículo e historial local duradero se confirman juntos. La revisión de contexto de lectura no es una credencial: se revalida autoridad actual al confirmar. Una revocación o fallo del historial aborta; versiones obsoletas dan 409. Repetir valores con versión vigente no incrementa versión ni crea evento. El tercero propietario es inmutable. Los eventos incluyen actor, instante, acción, correlación y versiones, sin tokens ni cuerpos completos.

## Asignaciones y desactivación segura

AssignmentAccessReader distingue evidencia CONFIRMED con revisión de UNAVAILABLE. Una asignación activa debe incluir vehículo, tercero, subject e identidad del conductor. El proveedor MongoDB consulta `vehicle_assignments` y AssignmentConfirmation vuelve a comprobar la ausencia dentro de la transacción de vehículos. Una asignación activa bloquea la transición con `409 VEHICLE_HAS_OPEN_ASSIGNMENT`; una base inaccesible o un documento inválido responde `503 ASSIGNMENT_PROVIDER_UNAVAILABLE`.

El bootstrap compone el proveedor MongoDB de asignaciones. Las consultas DRIVER solo exponen vehículos con asignación propia confirmada; si el proveedor no puede leer, devuelven 503. La UI muestra “Asignación no disponible” y no “Sin conductor asignado” sin evidencia. Una ausencia confirmada permite desactivar; asignación abierta da 409; INACTIVE puede reactivarse sin restaurar asignaciones. Un cambio sin efecto con versión vigente no requiere una nueva confirmación de desactivación.

VehicleFactsReader expone id, versión y elegibilidad ACTIVE. No hay rutas de transferencia ni CRUD de asignaciones en este cambio; los escritores de asignaciones deben usar `vehicle_assignments` y coordinar su revisión dentro de la transacción. Ninguna operación modifica facturas; referencias históricas se conservan. Audit transversal continúa pendiente: `vehicle_management_events` es historial local duradero, no integración con Audit.

## Inventario y despliegue

Antes de habilitar el entorno, ejecutar `npm --prefix backend run vehicles:inventory` con la configuración Mongo del destino. El inventario solo lee: informa IDs inválidos, no canónicos y duplicados normalizados, sin valores de identidad ni cambios funcionales. Código 0 significa listo; 2 exige reconciliación explícita; 1 indica fallo técnico. La inicialización del repositorio bloquea índices y operación si el inventario no está listo. Ensayar primero en una base `_test`.

Si hay datos heredados, obtener número interno y tarjeta reales del responsable, resolver duplicados y metadatos con evidencia y revisión, conservar historial y repetir inventario. Nunca inventar valores ni completar automáticamente campos. El inventario no migra datos. Detener escritores antiguos durante reconciliación y creación de índices. Desplegar API/UI después de las comprobaciones; rollback retira rutas/composición conservando documentos e historial.
