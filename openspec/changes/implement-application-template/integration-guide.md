# Guía de integración del template

## Rutas y navegación de módulos

El shell conserva la composición en `frontend/src/app/app.tsx`. Los módulos de marcador se registran en `frontend/src/app/module-registry.tsx`, con `key`, `path`, `label`, permiso de lectura, requisito de contexto y descripción. La navegación se construye desde ese registro y `AuthorizedNavigation` oculta entradas sin permiso; las rutas usan `ProtectedRoute` y `OrganizationContextGuard`, por lo que la visibilidad del menú no sustituye la autorización del servidor.

Al reemplazar un marcador, conserva su ruta y permiso si el contrato sigue vigente, cambia `MarkerModulePage` por la pantalla del módulo y añade el puerto de aplicación y su adaptador bajo el módulo. No importes adaptadores HTTP o credenciales desde componentes de presentación. Para un nuevo módulo, registra su permiso en el vocabulario público de `authentication/domain/permissions.ts` solo cuando el backend ya lo publique.

## Usuarios y asociaciones

La pantalla de Usuarios recibe `CompanyApi` e `InvitationApi` por composición. El selector reutiliza `GET /api/companies`, pagina los resultados y consulta por nombre/NIT; la consulta sin texto ordena por razón social ascendente. No agregues un endpoint de búsqueda duplicado. Después de seleccionar empresa se habilita el listado. Los filtros se limitan al contexto y se aplican en cascada: tipo limita tercero, tercero limita rol. La asociación usa correo con autocompletado y la API de invitaciones existente; el selector de tercero se limita a la empresa seleccionada. La respuesta disponible para usuarios suspendidos puede no incluir un perfil; en ese caso la UI debe indicar que el perfil no está disponible y no inventar un nombre.

Los contratos de sesión, permisos y contexto están en `authentication/application/session-ports.ts`, `authentication/application/read-permissions.ts` y `organization-context/application/context-ports.ts`. Los DTO de asociaciones y candidatos están en `user-invitations/application/invitation-api.ts`. Mantén los tokens en infraestructura y no los copies al estado de presentación.

## Entregas de notificaciones

`notifications/application/delivery-api.ts` define un DTO cerrado que admite estado, canal, fechas, intentos, destinatario enmascarado y resultado saneado. Su esquema rechaza campos adicionales como cuerpo, HTML, tokens, claves de idempotencia o credenciales. Todavía no existe una ruta backend de lectura administrativa ni un permiso de entregas en el contrato de autorización. Por eso no registres la ruta ni expongas datos hasta que backend publique ambos contratos y sus reglas de alcance. No adaptes la API del worker directamente al navegador.

## Seguridad y verificación

Toda consulta administrativa debe usar el transporte autenticado y el alcance de contexto activo; el servidor sigue siendo la autoridad para 401/403. Ejecuta `npm run check` y `npm run build` desde `frontend`. Ejecuta `npm run test:e2e` si el entorno tiene los servicios de prueba y Chromium instalados. Los datos de ejemplos deben ser sintéticos, y nunca incluyas cuerpos de correo, tokens, secretos SMTP ni credenciales en fixtures o capturas.
