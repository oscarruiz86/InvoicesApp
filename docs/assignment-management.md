# Gestión de asignaciones

Assignment pertenece a Fleet y administra `vehicle_assignments`, que es la fuente canónica usada por Vehicle y Driver. Cada registro guarda el tercero, vehículo, conductor, subject y nombre de conductor como referencias históricas inmutables, además de estado, versión, fecha UTC de inicio y datos locales de auditoría. Subject y actores internos no aparecen en las respuestas HTTP.

## Reglas y permisos

La relación es muchos a muchos: un vehículo puede tener varios conductores activos y un conductor puede tener varios vehículos activos. MongoDB impide repetir el mismo par activo de tercero, vehículo y conductor mediante un índice único parcial. Los selectores muestran todos los participantes activos elegibles aunque ya tengan otras relaciones. Finalizar una asignación termina únicamente ese par; una asignación finalizada no se edita, reabre ni elimina y su historial se conserva.

`THIRD_PARTY_ADMIN` necesita permiso vigente `vehicles:assign` para crear y `vehicles:unassign` para cerrar. `assignments:read` permite consultar el historial del tercero activo. `DRIVER` con ese permiso solo recibe sus propias asignaciones ACTIVE. No se otorga acceso operativo por ser `APP_ADMIN` o `COMPANY_ADMIN`. El contexto `scope=organization&thirdPartyId=...` es explícito y el backend vuelve a verificar permisos, membership y elegibilidad.

La API requiere Bearer y no almacena perfiles ni credenciales en Keycloak. Los conductores se leen desde Identity; asignaciones persisten solo sus referencias/snapshot operativo. Nada en este módulo escribe en Keycloak.

## Operaciones REST

- `GET /api/assignments`: lista paginada, filtro opcional por `driverId`, `vehicleId`, `status` o texto `q`, ordenada por `startedAt`, `status`, `driverName` o `vehicleId`.
- `GET /api/assignments/{id}`: detalle neutral dentro del tercero indicado.
- `POST /api/assignments`: cuerpo `{ "vehicleId", "driverId" }`; el servidor fija IDs, sujeto, nombre, inicio, estado y versión. Devuelve 409 si el mismo par ya tiene una relación activa.
- `POST /api/assignments/{id}/close`: cuerpo `{ "expectedVersion" }`; devuelve 200 con cierre versionado o el resultado idempotente vigente.

El listado y detalle devuelven paginación y un DTO seguro que omite subject y actores. Las respuestas técnicas usan `no-store`. Conflictos de unicidad/versiones devuelven 409; ausencia de evidencia, autorización vigente o auditoría local devuelve 503 sin confirmar cambios. El contrato completo está en [OpenAPI 3.1](../backend/openapi/openapi.json), también publicado en `/api/openapi` y Swagger en `/api/docs`.

## Transacciones, auditoría y desactivación

Alta y cierre revalidan autoridad, contexto, Driver elegible, Vehicle activo y versiones en una transacción MongoDB. Cada transacción escribe su evento en `assignment_events`; una falla de auditoría revierte también la asignación y los fences de participantes. El historial es local a Fleet y no representa entrega al contexto Audit.

Al desactivar un conductor o vehículo, su caso de uso lee evidencia de Assignment y pasa una revisión al repositorio. La confirmación final ocurre dentro de la transacción de estado. Evidencia activa produce 409; un proveedor no disponible o evidencia inválida produce 503; no se cambia el participante en ninguno de esos casos.

## Preparación de datos

La colección parte vacía porque los escritores de asignación no existían antes de este cambio. El inventario de solo lectura y el procedimiento reversible de backfill/cuarentena están descritos en [preparación de datos](../backend/docs/assignment-migration.md). Validar primero en una base aislada terminada en `_test`. El servicio no crea índices operativos si detecta filas que requieren migración. Las escrituras exigen replica set o cluster sharded con soporte transaccional.
