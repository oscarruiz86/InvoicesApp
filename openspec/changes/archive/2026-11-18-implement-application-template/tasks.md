# Tasks

## 1. Base del template y contratos de presentación

- [x] 1.1 Integrar el template con la aplicación existente React, Vite, TypeScript, Material UI, React Router y Zustand, y verificar la compilación de producción.
- [x] 1.2 Definir los puertos y DTOs de presentación para sesión, permisos, contexto, usuarios, asociaciones y entregas de notificaciones, y verificar que no importan modelos de dominio ni secretos de infraestructura. Contrato de entrega cerrado y prueba de rechazo de campos sensibles en `notifications/application/delivery-api.ts`.
- [x] 1.3 Implementar el registro de rutas y navegación declarativa por módulo, permiso y contexto, y verificar que una sesión de prueba ve solo las rutas autorizadas. Los módulos de marcador comparten el registro y la navegación filtra permiso/contexto.

## 2. Shell, navegación y estados comunes

- [x] 2.1 Implementar el tema Material UI y los tokens aprobados para color, espaciado, tipografía, foco y estados, y verificar contraste, foco visible y navegación con teclado en los controles compartidos.
- [x] 2.2 Implementar `AppShell` con botón de menú antes del título, barra lateral plegable, menú móvil y avatar de usuario, y verificar las rutas disponibles a 360 px y 1280 px sin desplazamiento horizontal.
- [x] 2.3 Implementar el selector de contexto con espera, confirmación, rechazo e invalidación de datos de página, y verificar que un cambio exitoso recarga el contexto y un rechazo no muestra datos anteriores como actuales.
- [x] 2.4 Implementar vistas de carga de sesión, autenticación fallida, sesión expirada, contexto ausente, 403 y 404, y verificar que cada navegación mueve el foco al título y no expone datos protegidos. `RouteHeadingFocus` enfoca el encabezado de destino y espera encabezados que aparecen tras la carga.
- [x] 2.5 Distribuir las opciones del menú en los grupos del wireframe —Inicio, Administración, Flota, Facturas, Configuración y Auditoría— y ocultar los grupos sin rutas autorizadas. Roles y permisos queda junto a Parámetros en Configuración.
- [x] 2.6 Cerrar el sidenav móvil al seleccionar una opción; mantener abierto el menú lateral de escritorio.

## 3. Patrones reutilizables de módulo

- [x] 3.1 Implementar los componentes de listado con búsqueda, filtros, paginación, carga, vacío, error y reintento no bloqueante, y verificar el estado de recuperación con una fuente de datos de prueba que falle y se recupere sin ocultar contenido seguro. Para empresas, incluir búsqueda por NIT, razón social o nombre comercial y filtros de estado, tipo de documento, país, departamento y ciudad.
- [x] 3.2 Implementar formularios, detalles, resumen de validación y confirmaciones, y verificar que se conservan valores seguros y se muestran errores de campo y del servidor.
- [x] 3.3 Integrar rutas modulares declarativas usando los patrones comunes, y verificar que los módulos pueden registrar una pantalla sin acoplarse al shell. Conductores y Vehículos tienen páginas preparadas para conectar sus puertos; Asignaciones, Facturas, Parámetros, Roles y Auditoría conservan marcadores.
- [x] 3.4 Implementar el módulo Usuarios con selección obligatoria de empresa, selector precargado y ordenado por razón social, lista de asociaciones y un solo campo para buscar por nombre/correo/documento; conservar los nombres disponibles de usuarios suspendidos y cerrar avisos de éxito automáticamente. Evitar repetir el nombre de Empresa en Organización; permitir Tipo de organización Todos con asociaciones directas y de terceros de la empresa. Añadir ordenamiento por columnas y paginación. Verificar chips removibles, filtros en cascada y columnas sin correo.
- [x] 3.5 Implementar la asociación por empresa con el buscador existente de empresas por nombre/NIT, tipo Empresa/Tercero y selector modal de terceros limitado a la empresa; no incluir búsquedas separadas de usuario/documento en el formulario, que recibe el correo para la invitación. Autocompletar coincidencias de usuarios al escribir correo. Verificar que Tercero solo aparece para ese tipo y que rol/opciones dependen del destino.
- [x] 3.6 Implementar el detalle de usuario en solo lectura con tipo y número de documento, correo, empresa, organización, rol y estado; verificar que no se ofrece editar perfil.
- [x] 3.7 Implementar suspensión de una asociación con confirmación explícita y opciones Aceptar/Cancelar; verificar que Cancelar no envía cambios.
- [x] 3.8 Implementar acciones frontend de editar y desactivar en listados autorizados de empresa, conductor y vehículo, y verificar que cada acción abre el flujo correspondiente. Empresas usa su API actual; Flota define tablas, formularios, confirmaciones y permisos detrás de `FleetApi`.

## 4. Entregas de notificaciones

- [x] 4.1 Registrar la vista de entregas con el permiso `notifications:deliveries:read` y bloquear ruta y navegación cuando no se concede; verificar acceso concedido y denegado. El permiso de frontend queda listo; backend aún debe publicarlo.
- [x] 4.2 Implementar listado y detalle frontend de entrega con tipo, canal, fecha, estado, intentos, próximo intento, destinatario enmascarado y resultado saneado a través de `NotificationDeliveryReadPort`; verificar que `pending`, `sent` y `failed` son distinguibles.
- [x] 4.3 Agregar pruebas de presentación que rechacen DTOs con cuerpos de correo, tokens, claves de idempotencia, secretos SMTP o credenciales, y verificar que no se renderiza ninguno de esos valores. El esquema estricto bloquea esos campos antes de alcanzar una vista.

## 5. Verificación integrada

- [x] 5.1 Ejecutar compilación, pruebas de componentes y recorridos de escritorio y móvil para los cuatro roles definidos, y registrar la evidencia de permisos, foco, cambio de contexto y estados de página. Verificación actualizada: 121 pruebas unitarias, 12 recorridos Playwright a 360/1280 px, lint sin errores, chequeo de tipos, arquitectura y build.
- [x] 5.2 Actualizar la guía de integración del template con los contratos de registro de módulos, Usuarios y entregas de notificaciones, y verificar que los ejemplos no requieren datos sensibles. Ver `integration-guide.md`.

## Integraciones en sus módulos

Las tareas 3.8, 4.1 y 4.2 quedan cerradas para el alcance del template: las pantallas, acciones, permisos y puertos frontend están implementados y verificados. Las rutas, permisos backend y adaptadores HTTP se abordarán dentro de los cambios de Flota y Notificaciones cuando se desarrollen esos módulos. No quedan tareas abiertas en esta propuesta de template.

Consulta `integration-guide.md` para los contratos preparados y los puntos de conexión pendientes.

