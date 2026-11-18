# Design

## Context

`design-application-ui` contiene el mapa, los wireframes y los patrones elegidos. Lola ya cuenta con una aplicación React, Vite, TypeScript y Material UI que implementa autenticación, autorización, contexto organizacional, empresas e invitaciones/pertenencias. Este cambio adapta ese frontend y añade los patrones visuales comunes sin duplicar esos módulos. La capacidad de entregas de `notifications` existe en infraestructura de trabajador; cualquier vista administrativa requiere un contrato de lectura autorizado antes de exponerla.

## Goals / Non-Goals

**Goals:**

- Construir una base React con rutas, shell administrativo y componentes reutilizables para los módulos actuales.
- Conectar la composición visual a puertos de identidad, contexto y lectura de entregas.
- Dejar puntos de integración claros para las pantallas funcionales, sin repetir reglas de negocio.

**Non-Goals:**

- Crear o modificar endpoints, autorización de backend, SMTP, trabajos de entrega o plantillas de correo.
- Implementar CRUD de empresas, flota, facturas, parámetros o auditoría.
- Crear cuentas de identidad o modificar en backend las reglas de usuarios, asociaciones, suspensión o autorización; el frontend consume los contratos autorizados.
- Mostrar contenido del correo, tokens o secretos en la interfaz.

## Decisions

### Shell como límite de presentación

El template contendrá `AppShell`, icono de hamburguesa antes del título, navegación lateral adaptable, avatar de usuario y una salida para las rutas. En móvil, el icono abre un sidenav superpuesto al contenido. El menú del avatar mostrará iniciales, Contexto actual y Rol actual en líneas separadas, perfil, cambio de contraseña y cierre de sesión. Roles y permisos se registrará bajo Configuración. Cada módulo aportará sus rutas y pantallas a través de una definición de navegación que indique permiso, contexto requerido, etiqueta e icono.

### Permisos visibles, backend autoritativo

Un proveedor de sesión expondrá permisos y el contexto confirmado. El template ocultará navegación y deshabilitará acciones que no estén disponibles, pero cada adaptador HTTP conservará las respuestas 401 y 403 del backend como autoritativas. Una respuesta 401 dirigirá a sesión expirada y una 403 a acceso denegado. Confiar solo en la visibilidad de botones permitiría que un usuario intentara la ruta directamente.

### Estado de contexto aislado

El cambio de organización pasará por un estado de espera. Cuando se confirme, se invalidarán las consultas y los estados de página asociados al contexto anterior antes de cargar los del nuevo. Si el cambio falla, se mostrará la recuperación sin conservar resultados del contexto anterior como actuales. Recargar solo la pantalla activa dejaría datos inconsistentes en otras rutas.

### Componentes compartidos y accesibilidad

Material UI cubrirá controles accesibles y el tema definido en la guía. El template creará envoltorios ligeros para avisos de petición no bloqueantes, tabla con filtros, formulario con resumen de errores, confirmación y detalles. Cada navegación moverá el foco al título. El menú móvil se implementará como `Drawer` y devolverá el foco a su activador. El módulo Usuarios tendrá un flujo separado para consultar usuarios y administrar sus asociaciones por empresa.

### Módulo Usuarios

Usuarios administra asociaciones de cuentas con una empresa. Empresa se elige de forma independiente en un selector que precarga empresas ordenadas por razón social ascendente y reutiliza `GET /api/companies`: el backend ya busca por NIT, razón social y nombre comercial. La consulta inicial omite `q` vacío, y el selector pagina resultados. Hasta que se resuelva una empresa no se muestran la lista ni los filtros avanzados. El listado presenta Usuario, Empresa, Organización, Rol, Estado y Acciones; los encabezados ordenables cambian entre ascendente y descendente, y la paginación se presenta bajo los resultados. La columna Organización muestra `Empresa` para una asociación directa y el nombre del tercero para una asociación de tercero, para no repetir el nombre de la empresa. El filtro Todos combina asociaciones directas y de terceros activos asociados a la empresa, con autorización en ese alcance. El correo se consulta en el detalle, no como columna de la tabla. Si una asociación está suspendida, se conserva el nombre mientras el proveedor de identidad pueda devolverlo.

Los filtros avanzados se habilitan tras seleccionar la empresa. Un solo campo busca por nombre, correo o número de documento. Si se consulta por documento, el identificador se compara completo; una búsqueda textual valida el nombre localmente para descartar coincidencias amplias de Keycloak que no correspondan con el nombre. Los filtros activos se muestran como chips removibles, salvo Empresa. Tipo de organización limita Organización y Organización limita Rol. El aviso de éxito se cierra automáticamente después de cinco segundos.

La asociación usa Empresa y Tipo de organización. El formulario recibe un correo para emitir la invitación y no incluye buscadores separados de nombre o documento; su campo de correo consulta coincidencias mientras se escribe y permite seleccionar una sugerencia. Si el tipo es Empresa, la empresa seleccionada es el destino y no se presenta otro campo de organización. Si el tipo es Tercero, se abre un modal de búsqueda por nombre o NIT limitado a terceros de la empresa. Empresa permite Administrador de empresa; Tercero permite Administrador de tercero y Conductor. El detalle es de solo lectura e incluye tipo y número de documento, correo, empresa, organización, rol y estado. Suspender requiere confirmación explícita.

### Entregas de notificaciones como vista técnica protegida

La pantalla de entregas es un módulo frontend de lectura que consume `NotificationDeliveryReadPort` y el DTO específico. El DTO admite identificador, tipo, canal, fecha, estado, destinatario enmascarado, intentos, próximo intento y código saneado; excluye la referencia del proveedor. Nunca acepta ni renderiza cuerpo, HTML, token, clave de idempotencia, configuración SMTP o credenciales. El frontend registra `/notification-deliveries` con `notifications:deliveries:read`; la ruta y su navegación se muestran solo cuando autorización concede ese permiso. El servicio HTTP y la publicación del permiso son complemento backend pendiente. Reutilizar una vista genérica de auditoría podría aumentar accidentalmente la superficie de datos expuestos.

## Risks / Trade-offs

- [El frontend ya contiene módulos funcionales] → Integrar el shell y los patrones sobre los componentes existentes y mantener las rutas, contratos y límites de autorización vigentes.
- [Las rutas de módulos funcionales pueden cambiar] → Mantener rutas y entradas de navegación centralizadas y actualizar el contrato del módulo al implementarlo.
- [Una entrega SMTP ambigua puede volver a intentarse] → Mostrar el estado de entrega y el resultado saneado, sin presentar `sent` como evidencia de lectura final.
- [El contexto puede cambiar durante una petición] → Cancelar o invalidar las consultas de la vista anterior y exigir respuesta con el contexto vigente.

## Migration Plan

1. Adaptar el shell existente y sus rutas de estado conservando las páginas y contratos funcionales.
2. Registrar de forma incremental las rutas de módulos disponibles.
3. Conectar los puertos de Flota y entregas a los servicios backend en las tareas complementarias 6.1–6.3.
4. Deshacer el cambio retirando el registro del shell y sus rutas. Los módulos no deberán depender de componentes internos no sustituidos.

La ruta de entregas está registrada en frontend, pero `ProtectedRoute` y la navegación solo la exponen para sesiones cuyo snapshot de permisos incluya `notifications:deliveries:read`; backend debe publicar ese permiso y las reglas de alcance antes de habilitarla en un entorno real.
