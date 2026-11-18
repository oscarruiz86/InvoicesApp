# Guía de integración del template

## Rutas y navegación de módulos

El shell conserva la composición en `frontend/src/app/app.tsx`. Los módulos de marcador se registran en `frontend/src/app/module-registry.tsx`, con `key`, `path`, `label`, permiso de lectura, requisito de contexto y descripción. La navegación se construye desde ese registro y `AuthorizedNavigation` oculta entradas sin permiso; las rutas usan `ProtectedRoute` y `OrganizationContextGuard`, por lo que la visibilidad del menú no sustituye la autorización del servidor.

Al conectar un módulo, conserva su ruta y permiso si el contrato sigue vigente y añade el adaptador HTTP junto al módulo. No importes adaptadores HTTP o credenciales desde componentes de presentación. El vocabulario público incluye los permisos que requieren las pantallas; la navegación y las rutas siguen bloqueadas hasta que la autorización de backend los conceda.

## Usuarios y asociaciones

La pantalla de Usuarios recibe `CompanyApi` e `InvitationApi` por composición. El selector reutiliza `GET /api/companies`, pagina los resultados y consulta por nombre/NIT; la consulta sin texto ordena por razón social ascendente. No agregues un endpoint de búsqueda duplicado. Después de seleccionar empresa se habilita el listado. Los filtros se limitan al contexto y se aplican en cascada: tipo limita tercero, tercero limita rol. La asociación usa correo con autocompletado y la API de invitaciones existente; el selector de tercero se limita a la empresa seleccionada. La respuesta disponible para usuarios suspendidos puede no incluir un perfil; en ese caso la UI debe indicar que el perfil no está disponible y no inventar un nombre.

Los contratos de sesión, permisos y contexto están en `authentication/application/session-ports.ts`, `authentication/application/read-permissions.ts` y `organization-context/application/context-ports.ts`. Los DTO de asociaciones y candidatos están en `user-invitations/application/invitation-api.ts`. Mantén los tokens en infraestructura y no los copies al estado de presentación.

## Entregas de notificaciones

`notifications/application/delivery-api.ts` define un DTO cerrado y `NotificationDeliveryReadPort` define las operaciones de lista y detalle. La pantalla de `/notification-deliveries` presenta estados `pending`, `sent` y `failed`, fechas, intentos, destinatario enmascarado y resultado saneado; su registro requiere `notifications:deliveries:read`. El esquema rechaza campos adicionales como cuerpo, HTML, tokens, claves de idempotencia o credenciales. La ruta HTTP administrativa y el permiso backend todavía deben implementarse; hasta entonces la composición no inyecta el puerto y presenta el estado de integración pendiente. No adaptes la API del worker directamente al navegador.

## Flota frontend lista para integración

`fleet/application/fleet-api.ts` define los puertos de listado, actualización y estado para conductores y vehículos. Las páginas `/drivers` y `/vehicles` ya incluyen tablas ordenables, estados, paginación, edición y activación/desactivación condicionadas por `drivers:update`, `drivers:deactivate`, `vehicles:update` y `vehicles:deactivate`. Los campos son deliberadamente mínimos: nombre e identificación del conductor; placa, estado y conductor vigente del vehículo. Inyecta `FleetApi` al implementar las rutas backend; hasta entonces las páginas indican que el servicio no está conectado.

## Seguridad y verificación

Toda consulta administrativa debe usar el transporte autenticado y el alcance de contexto activo; el servidor sigue siendo la autoridad para 401/403. Ejecuta `npm run check` y `npm run build` desde `frontend`. Ejecuta `npm run test:e2e` si el entorno tiene los servicios de prueba y Chromium instalados. Los datos de ejemplos deben ser sintéticos, y nunca incluyas cuerpos de correo, tokens, secretos SMTP ni credenciales en fixtures o capturas.
