# Design

## Context

Ver `proposal.md`. El backend ya reconoce `DRIVER` como rol local de una membership aceptada y `THIRD_PARTY_ADMIN` posee los grants de conductor, pero no tiene un módulo Fleet de servidor. La aceptación de invitaciones y los cambios de membership son transacciones MongoDB de Organizations. El frontend sí contiene el puerto provisional `FleetApi` y la ruta `/drivers`, pero su formulario pretende actualizar nombre e identificación, que son datos canónicos de Keycloak.

## Goals / Non-Goals

**Goals:** crear el agregado local mínimo de Driver, enlazarlo de modo transaccional a memberships, exponer consulta y estado con autorización vigente, y reemplazar la interfaz provisional sin duplicar Identity.

**Non-Goals:** definir licencia, teléfono, dirección u otros campos operativos; modificar perfiles, credenciales o roles Keycloak; CRUD independiente de identidades; vehículos, asignaciones, facturas, transferencia de tercero, o una invalidación push entre pestañas.

## Decisions

### 1. Driver es un agregado local de Flota, no un perfil de usuario

`Driver` conservará `id`, `subject`, `membershipId`, `thirdPartyId`, `status`, `version`, fechas y actores de transición. El vínculo único será `membershipId`; el mismo subject puede tener conductores separados para memberships de terceros diferentes. Nombre, documento y correo se leerán mediante el puerto de Identity para mostrarse como una proyección de solo lectura y nunca se copiarán como atributos editables.

Se descarta reutilizar `organization_memberships` como el agregado de Flota: una membership expresa acceso, mientras que Driver debe conservar su propio estado, historial y contrato de elegibilidad. También se descarta almacenar un perfil duplicado o editable porque rompería la autoridad de Keycloak.

### 2. Aprovisionamiento dentro de las transacciones de Organizations

La aceptación de una invitación DRIVER extenderá la transacción existente para insertar exactamente un Driver ACTIVE con la membership recién creada. El cambio de roles de una membership materializará Driver si se añade DRIVER y no existe; al retirar DRIVER inactivará el registro histórico. Suspender una membership o tercero no cambia retrospectivamente Driver, pero vuelve su hecho de elegibilidad negativo. La reactivación de un conductor requiere la transición explícita de Flota y membership/tercero elegibles.

Organizations dependerá de un puerto estrecho de aprovisionamiento, implementado por Fleet y compuesto en bootstrap; no importará infraestructura ni modelos de Fleet. La alternativa de crear Driver desde el navegador después de aceptar la invitación se descarta porque deja un rol DRIVER autorizado sin propietario operativo y permite fallos parciales.

Una migración técnica idempotente creará Driver únicamente para memberships preexistentes ACTIVE con DRIVER y terceros activos. Se vincula por `membershipId`, nunca por nombre, correo o documento, y conserva una procedencia de migración en el historial. No habrá creación perezosa durante consultas.

### 3. Autorización y confirmación de estado en un único punto

Las consultas exigen contexto `organization` con solo `thirdPartyId`; se rechazan GLOBAL, SELF, companyId, parámetros duplicados y ámbitos ambiguos. Un THIRD_PARTY_ADMIN puede listar/detallar todos los Drivers de su tercero con `drivers:read`; un DRIVER queda filtrado a su propio `subject`. Las rutas de estado requieren `drivers:deactivate`, aun al activar, siguiendo la semántica de transición de estado existente.

El repositorio de Fleet abrirá la transacción para una mutación y volverá a leer política, evidencia organizacional, membership, tercero, Driver y versión. Confirmará sus revisiones y un evento duradero del historial de Driver en la misma transacción, siguiendo el patrón de coordinación de Third Parties. Esto evita que un permiso, membership o tercero revocado entre la autorización inicial y el `commit` confirme un cambio. La entrega al bounded context Audit no se declara completada porque Audit persistente aún no existe. Se descarta confiar en el snapshot del frontend o separar lectura de autorización y escritura sin confirmación.

### 4. Contrato REST limitado y errores neutros

Se publicarán `GET /api/drivers`, `GET /api/drivers/:id` y `PATCH /api/drivers/:id/status`, todos Bearer, JSON y `Cache-Control: no-store`. GET usa paginación, orden cerrado y `scope=organization&thirdPartyId=<id>`; PATCH acepta únicamente `{ expectedVersion, status }`. No se publica POST ni PUT de perfil: la creación es la invitación DRIVER y no hay campos operativos aprobados para `drivers:update`.

Los permisos/contexto inválidos responden 403 antes de buscar recursos; IDs inexistentes o ajenos devuelven el mismo 404; validación 400, revisión obsoleta 409, y dependencias/almacenamiento no disponibles 503. OpenAPI describe ese contrato, incluidos cuerpos cerrados y proyección de identidad nullable. La alternativa de reutilizar las rutas de memberships se descarta porque filtraría por asociación, no por agregado Driver ni su estado.

### 5. Proyección de identidad sin caché autoritativa

Fleet consulta Identity para enriquecer la vista con nombre, documento y correo. Si un perfil individual no está disponible, conserva el Driver y expone `identity: null`; la interfaz indica que el perfil no está disponible. La identidad no se guarda como copia en MongoDB ni se usa como prueba de acceso. La página se limita a 100 resultados y las pruebas cubrirán identidades faltantes para impedir que una falla parcial oculte registros o conceda acceso.

### 6. Sustitución del adaptador y la pantalla provisional

`FleetApi` se dividirá en contratos de conductor y vehículo o se reducirá de forma compatible para quitar `updateDriver`. El adaptador HTTP protegido tendrá operaciones cerradas para rutas de Drivers, propagará 401/403 al ciclo de sesión/autorización y capturará el contexto antes de cada solicitud. La página `/drivers` mostrará listado, detalle de identidad solo lectura, estado y confirmación de activar/desactivar; no renderizará el diálogo de edición heredado. Navegación y acceso directo exigen contexto de tercero y `drivers:read`.

## Risks / Trade-offs

- [No hay campos operativos aprobados] → el cambio no activa `drivers:update`; una propuesta posterior debe definir campos, privacidad, validación y migración antes de publicar PUT.
- [El agregado y Organizations comparten una transición] → un puerto de aprovisionamiento transaccional y pruebas con MongoDB real verifican que no haya membership sin Driver tras aceptación DRIVER.
- [Identity puede fallar o variar] → la proyección es nullable y solo lectura; el estado y la autorización nunca dependen de datos suministrados por el navegador.
- [La migración encuentra datos ambiguos] → se detiene por conflictos de unicidad y entrega inventario; no fusiona ni corrige asociaciones automáticamente.
- [Audit no tiene entrega/retención integral] → se conserva historial duradero local de Driver; la entrega transversal queda explícitamente pendiente.
- [Vehículos/Assignments aún no existen] → el contrato de elegibilidad devuelve solo hechos de Driver y no presume asignaciones.
- [Cambios OpenSpec activos de autorización y contexto] → implementar contra sus contratos actuales y no marcar sus tareas pendientes como completadas.

## Migration Plan

1. Crear índices únicos por `membershipId` y las colecciones/historial de Driver sin exponer rutas todavía.
2. Ejecutar una comprobación de inventario en una base terminada en `_test`; corregir o reportar memberships DRIVER sin tercero activo antes de la migración real.
3. Ejecutar la migración idempotente, publicar el aprovisionamiento transaccional y probar aceptación/cambio de roles concurrentes.
4. Publicar rutas, OpenAPI y el frontend después de validar autorización, neutralidad de IDs y cambios de estado.
5. Revertir retirando rutas y UI; conservar Driver e historial porque la membership y módulos futuros pueden seguir referenciarlos. Una reversión del aprovisionamiento no borra registros confirmados.
