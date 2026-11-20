# Gestión de conductores

## Modelo e identidad

`Driver` es un registro local de Flota vinculado de forma única a una membership de tercero. Guarda su ID local, tercero, estado, versión y marcas de auditoría. La API devuelve ese registro sin exponer `subject`, `membershipId` ni los actores internos. Nombre, documento y correo se consultan a Identity para mostrarlos como `identity`; si el perfil no está disponible, la respuesta conserva el Driver con `identity: null`.

La identidad es de solo lectura. No se copian nombre, documento, correo o credenciales a MongoDB y no hay una ruta para editar esos datos. El flujo para obtener un conductor es una invitación con rol `DRIVER` a un tercero; no existe un alta paralela desde la pantalla de conductores. Ver también [registros de invitaciones y memberships](../backend/docs/user-invitation-records.md).

## Aprovisionamiento y roles

Aceptar una invitación `DRIVER` crea la invitación aceptada, membership, asociación de rol, Driver y eventos locales dentro de la misma transacción MongoDB. Agregar `DRIVER` a una membership existente crea el Driver si falta; quitar el rol lo inactiva y conserva su historial. Repetir el estado o un conjunto idéntico de roles no agrega eventos duplicados. Suspender la membership o desactivar el tercero vuelve no elegible al conductor sin reescribir su perfil de Identity ni cambiar Keycloak.

## Acceso HTTP

Las rutas están protegidas con Bearer y responden `Cache-Control: no-store`:

- `GET /api/drivers`: lista paginada, ordenada por `createdAt` o `status`.
- `GET /api/drivers/{id}`: detalle del conductor e identidad nullable.
- `PATCH /api/drivers/{id}/status`: acepta únicamente `{ expectedVersion, status }`.

Las tres operaciones requieren `scope=organization` y `thirdPartyId` explícitos. `THIRD_PARTY_ADMIN` queda limitado al tercero autorizado; `DRIVER` solo puede consultar su propio subject y membership activa. IDs ajenos e inexistentes tienen el mismo `404`. Un cambio de estado exige `drivers:deactivate` y versión vigente, incluso para activar. Antes de desactivar, Assignment confirma la ausencia de asignaciones ACTIVE; una asignación abierta devuelve 409 y evidencia indisponible devuelve 503 sin cambiar el conductor. `drivers:update` no se usa para editar perfiles y no hay `POST`/`PUT` de conductor.

## Inventario y migración

Desde la raíz del repositorio, configura el backend para la base objetivo y ejecuta primero el inventario de solo lectura:

```powershell
npm --prefix backend run drivers:inventory
```

Revisa los conflictos y las memberships elegibles antes de aplicar la migración:

```powershell
npm --prefix backend run drivers:migrate
```

La migración crea Drivers únicamente para memberships activas con rol `DRIVER` y tercero activo. Vincula solo por `membershipId`, es idempotente y conserva la procedencia `MIGRATION` en el historial local. Si el inventario informa conflictos, la aplicación se detiene; no fusiona personas por nombre, correo o documento. Usa una base de prueba terminada en `_test` para validar el procedimiento antes de seleccionar un entorno funcional.

Verificaciones disponibles desde la raíz:

```powershell
npm --prefix backend run test:integration
npm --prefix backend run test:http
npm --prefix backend run openapi:lint
```

El esquema publicado está en [OpenAPI](../backend/openapi/openapi.json), disponible además en `/api/openapi` y Swagger en `/api/docs`.

## Límites de identidad

No se agregan licencia, teléfono, dirección ni otros campos operativos. La identidad canónica permanece en Keycloak y se lee desde Identity; Fleet nunca modifica perfiles ni credenciales. El historial local de Driver es durable, pero no implica entrega transversal a un Audit persistente. La administración de vehículos y asignaciones se documenta en [gestión de vehículos](vehicle-management.md) y [gestión de asignaciones](assignment-management.md).
