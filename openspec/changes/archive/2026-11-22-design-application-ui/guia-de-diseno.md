# Guía de diseño del panel administrativo

Abre [los wireframes](wireframes.html) en el navegador y selecciona rol, ancho y pantalla. El selector de estado permite revisar carga, vacío, error recuperable y confirmación sobre la pantalla elegida. El catálogo permite revisar también los flujos que dependen de decisiones pendientes. Las rutas se proponen para documentar el recorrido. Los datos y los resultados de las acciones son simulados.

## Mapa de navegación

- Acceso → Keycloak → validación → Inicio o selección de contexto → menú autorizado. Sesión expirada → acceso. 403 y 404 → Inicio.
- Inicio → Administración → Empresas, Terceros, Usuarios, Roles o Asociaciones. Listado → detalle → alta, edición o cambio de estado según permiso.
- Inicio → Flota → Conductores, Vehículos y Asignaciones. Vehículo → historial → cambio de tercero, sujeto a política → confirmación o conflicto.
- Inicio → Facturas → listado → detalle → edición elegible. Listado → captura manual o QR → revisión → confirmación → detalle.
- Inicio → Configuración → Parámetros → valor efectivo → edición. Auditoría → eventos → detalle autorizado.
- Encabezado → organización → espera → contexto confirmado y datos actualizados, o rechazo → nueva selección. Menú de sesión → confirmación de salida.

## Patrones para Material UI

| Patrón | Decisión |
|---|---|
| Tema | Texto #17233A, secundario #475569, fondo #F4F6FA, superficie #FFFFFF, primario #1749AA, foco #1D4ED8. Estados con texto explícito además de color. |
| Tipografía y espacio | Título de página 24–28 px, cuerpo 16 px, metadatos 14 px. Escala de espacio 4, 8, 12, 16, 24 y 32 px. Radio 8 px en controles y 12 px en paneles. |
| Navegación | Barra de 228 px plegable en escritorio, menú superpuesto en móvil al implementar con Drawer. El wireframe utiliza un menú móvil desplegable para recorrer la jerarquía. Foco en el título de destino y retorno al disparador al cerrar diálogos. |
| Listados | Búsqueda, filtros, paginación y estado vacío. Tabla con encabezados y filtros etiquetados en escritorio. Tarjeta con los datos prioritarios y acceso al detalle en móvil. |
| Formularios | Campos etiquetados, requeridos explícitos, errores junto al campo y resumen al guardar. Conservar los valores seguros ante errores. Una columna a 360 px y hasta dos a 1280 px. |
| Confirmación y errores | Confirmación breve con consecuencia y cancelación. Anunciar carga y resultado. Ante 403 no exponer datos del recurso. Tras un conflicto actualizar el estado antes de reintentar. |
| Teclado | Enlace para saltar navegación, controles nativos, foco visible de 3 px. En la implementación, Escape cierra el diálogo o menú superpuesto y el foco vuelve al disparador. |

## Recorridos por rol

| Rol | Recorrido de revisión | Límites representados |
|---|---|---|
| APP_ADMIN | Inicio → Empresas → alta/edición/estado y asociación. Usuarios → identidad y roles. Parámetros → ventana efectiva. | Administración global según permiso. Flota y facturas quedan fuera de su menú con la matriz actual. |
| COMPANY_ADMIN | Selección de empresa → Empresas → detalle/edición. Terceros → alta/estado. Usuarios y Asociaciones → administrador de tercero permitido. | Empresas asociadas. Alta de empresas, parámetros y roles globales fuera de su menú. |
| THIRD_PARTY_ADMIN | Tercero autorizado → Conductores/Vehículos → asignar y consultar historial. Facturas → consultar y editar según política. | Creación de facturas pendiente para este rol. Reasignación entre terceros en catálogo hasta confirmar el permiso. |
| DRIVER | Contexto autorizado → Vehículos/Asignaciones activas propias → Facturas → captura manual o QR → detalle. | Sin administración de flota. Solo facturas propias y edición MANUAL elegible. |

Las pantallas condicionales usan la denegación por defecto definida en [la matriz de autorización](../implement-authorization/specs/identity-access/spec.md). El frontend final debe usar los permisos confirmados por el backend, incluidas las restricciones sobre el recurso.

## Decisiones pendientes

- Confirmar contratos y campos de terceros, usuarios, conductores y vehículos. Los ejemplos de esos formularios están sujetos a las propuestas funcionales.
- Confirmar formato y campos protegidos del QR (P3), cardinalidades y efectos de cambios de flota (P4) y permiso exacto de traslado entre terceros.
- Confirmar ventana, límite y efecto temporal (P2), permiso de consulta de auditoría, retención y datos visibles (P5). La simulación de auditoría está disponible en el catálogo.
- Confirmar métricas reales para Inicio y reconciliar las rutas propuestas con las rutas vigentes de cada módulo.

## Matriz de trazabilidad

| Pantalla | Ruta propuesta o estado | Alcance de rol | Acciones de navegación | Validación o estado de revisión | OpenSpec |
|---|---|---|---|---|---|
| Entrar a Invoices App | `/login` | Público | Iniciar sesión | Proveedor no disponible; reintentar | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Validando sesión | `/auth/callback` | Público | Continuar · Error de acceso | Carga; retorno seguro al destino permitido | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| No pudimos iniciar sesión | `/auth/error` | Público | Reintentar | Conservar un mensaje accionable | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Tu sesión expiró | `/session-expired` | Público | Volver a iniciar sesión | Ocultar datos de sesión anterior | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Cerrar sesión | `/logout` | Sesión/contexto | Cerrar sesión · Cancelar | Limpiar contexto y datos de sesión | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Inicio | `/` | Sesión/contexto | Organización activa · Cerrar sesión | Accesos por rol; métricas pendientes | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Elegir organización | `/context` | Sesión/contexto | Confirmar · Sin opciones | Mostrar solo opciones confirmadas como elegibles | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Cambiando organización | `/context · espera` | Sesión/contexto | Cambio confirmado · Cambio rechazado | Limpiar resultados y bloquear acciones dependientes | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Organización actualizada | `/context · confirmado` | Sesión/contexto | Volver a inicio | Recargar datos para el nuevo contexto | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| No pudimos cambiar de organización | `/context · rechazo` | Sesión/contexto | Elegir otra organización · Sin opciones | Evitar resultados anteriores y verificar el contexto válido | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Sin organización disponible | `/context · sin opciones` | Sesión/contexto | Volver a consultar · Cerrar sesión | Sin acciones operativas hasta confirmar acceso | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Acceso denegado | `/403` | Sesión/contexto | Volver a inicio · Cambiar organización | Mensaje sin datos del recurso | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Página no encontrada | `/404` | Sesión/contexto | Volver a inicio | Navegación segura | [Autenticación](../implement-authentication/specs/frontend-shell/spec.md) |
| Empresas | `/companies` | APP_ADMIN, COMPANY_ADMIN | Ver empresa · Crear empresa | Búsqueda por prefijo de NIT, razón social o nombre comercial; filtros de estado, tipo de documento y ubicación | [Empresas](../implement-company-management/specs/company-management/spec.md) |
| Detalle de empresa | `/companies/:id` | APP_ADMIN, COMPANY_ADMIN | Editar · Gestionar administradores · Cambiar estado · Volver | APP_ADMIN global; COMPANY_ADMIN solo empresa asociada | [Empresas](../implement-company-management/specs/company-management/spec.md) |
| Crear empresa | `/companies/new` | APP_ADMIN | Guardar · Cancelar | NIT de 1 a 20 dígitos, conserva ceros; dígito opcional de un carácter numérico; email válido; NIT duplicado 409 | [Empresas](../implement-company-management/specs/company-management/spec.md) |
| Editar empresa | `/companies/:id/edit` | APP_ADMIN, COMPANY_ADMIN | Guardar · Cancelar | Mismas validaciones del alta; conservar formulario ante duplicado o error | [Empresas](../implement-company-management/specs/company-management/spec.md) |
| Cambiar estado de empresa | `/companies/:id · confirmación` | APP_ADMIN | Confirmar · Cancelar | Una empresa inactiva deja de ser contexto elegible | [Empresas](../implement-company-management/specs/company-management/spec.md) |
| Terceros | `/third-parties` | COMPANY_ADMIN, THIRD_PARTY_ADMIN | Ver tercero · Crear tercero | Empresa asociada para COMPANY_ADMIN; terceros asociados para THIRD_PARTY_ADMIN | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Detalle de tercero | `/third-parties/:id` | COMPANY_ADMIN, THIRD_PARTY_ADMIN | Editar · Gestionar asociaciones · Cambiar estado · Volver | Campos definitivos pendientes de la especificación del módulo | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Crear tercero | `/third-parties/new` | COMPANY_ADMIN | Guardar · Cancelar | Campos ilustrativos; empresa dentro del ámbito autorizado | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Editar tercero | `/third-parties/:id/edit` | COMPANY_ADMIN, THIRD_PARTY_ADMIN | Guardar · Cancelar | Campos y relaciones editables pendientes | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Cambiar estado del tercero | `/third-parties/:id · confirmación` | COMPANY_ADMIN | Confirmar · Cancelar | Impacto sobre recursos dependientes pendiente | [Contexto](../implement-organization-context/specs/organization-context/spec.md) |
| Usuarios | `/users` | APP_ADMIN, COMPANY_ADMIN | Ver usuario · Crear identidad | COMPANY_ADMIN solo objetivos autorizados de tipo administrador de tercero | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Detalle de usuario | `/users/:id` | APP_ADMIN, COMPANY_ADMIN, DRIVER | Editar perfil · Gestionar asociaciones · Volver a inicio | DRIVER solo su propio perfil | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Crear identidad | `/users/new` | APP_ADMIN, COMPANY_ADMIN | Continuar · Cancelar | La creación, la asociación y la asignación de roles son acciones distintas | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Editar identidad | `/users/:id/edit` | APP_ADMIN | Guardar · Cancelar | Campos finales sujetos al contrato de usuarios | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Roles y permisos | `/roles` | APP_ADMIN | Ver rol | Catálogo autorizado; sin herencia ni comodines | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Detalle de rol | `/roles/:id` | APP_ADMIN | Gestionar permisos · Volver | No delegar APP_ADMIN sin política expresa | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Gestionar permisos | `/roles/:id/permissions` | APP_ADMIN | Revisar y guardar · Cancelar | Operaciones concretas y confirmación sujetas al contrato funcional | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Asociaciones | `/associations` | APP_ADMIN, COMPANY_ADMIN | Gestionar asociación · Volver a inicio | APP_ADMIN en ámbito administrativo; COMPANY_ADMIN en relaciones autorizadas | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Gestionar asociación | `/associations/:id` | APP_ADMIN, COMPANY_ADMIN | Guardar cambio · Cancelar | Validar objetivo y organización; sin autoescalamiento | [Permisos](../implement-authorization/specs/identity-access/spec.md) |
| Conductores | `/drivers` | THIRD_PARTY_ADMIN | Ver conductor · Crear conductor | Datos del tercero activo | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Detalle de conductor | `/drivers/:id` | THIRD_PARTY_ADMIN, DRIVER | Editar · Cambiar estado · Ver asignaciones | DRIVER solo su propio registro | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Crear conductor | `/drivers/new` | THIRD_PARTY_ADMIN | Guardar · Cancelar | Campos ilustrativos pendientes de ficha funcional | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Editar conductor | `/drivers/:id/edit` | THIRD_PARTY_ADMIN | Guardar · Cancelar | Validación según contrato del módulo | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Cambiar estado del conductor | `/drivers/:id · confirmación` | THIRD_PARTY_ADMIN | Confirmar · Cancelar | Efectos y cardinalidades pendientes de P4 | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Vehículos | `/vehicles` | THIRD_PARTY_ADMIN, DRIVER | Ver vehículo · Crear vehículo | DRIVER solo vehículos activos con asignación activa propia | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Detalle de vehículo | `/vehicles/:id` | THIRD_PARTY_ADMIN, DRIVER | Editar · Cambiar estado · Ver asignaciones · Ver historial | DRIVER no administra recursos | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Crear vehículo | `/vehicles/new` | THIRD_PARTY_ADMIN | Guardar · Cancelar | Campos ilustrativos pendientes del módulo | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Editar vehículo | `/vehicles/:id/edit` | THIRD_PARTY_ADMIN | Guardar · Cancelar | El cambio de tercero tiene su propio flujo | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Cambiar estado del vehículo | `/vehicles/:id · confirmación` | THIRD_PARTY_ADMIN | Confirmar · Cancelar | No ofrecer un vehículo inactivo para registrar facturas | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Asignaciones | `/assignments` | THIRD_PARTY_ADMIN, DRIVER | Ver asignación · Asignar vehículo · Ver historial | DRIVER solo asignaciones activas propias | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Detalle de asignación | `/assignments/:id` | THIRD_PARTY_ADMIN, DRIVER | Finalizar asignación · Volver | Mostrar contexto confirmado | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Asignar vehículo | `/assignments/new` | THIRD_PARTY_ADMIN | Confirmar · Ver conflicto · Cancelar | Incompatibilidades y vigencia según P4 | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Finalizar asignación | `/assignments/:id · confirmación` | THIRD_PARTY_ADMIN | Confirmar · Cancelar | Conservar la asignación previa en el historial | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Cambiar tercero del vehículo | `/vehicles/:id/transfer` | Pendiente | Confirmar · Ver conflicto · Cancelar | Permiso exacto y alcance sobre destino pendientes. La simulación está en el catálogo | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| No se pudo guardar la asignación | `/assignments · conflicto` | Pendiente | Consultar historial · Volver a la asignación | Recargar estado vigente antes de reintentar | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Historial de asignaciones | `/vehicles/:id/history` | THIRD_PARTY_ADMIN | Simular cambio de tercero · Volver | Conservar relaciones históricas aunque cambie el tercero | [Flota](../initial-invoices-app/specs/fleet-management/spec.md) |
| Facturas | `/invoices` | THIRD_PARTY_ADMIN, DRIVER | Ver factura · Registrar manualmente · Escanear QR | DRIVER solo propias. THIRD_PARTY_ADMIN consulta en contexto | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Detalle de factura | `/invoices/:id` | THIRD_PARTY_ADMIN, DRIVER | Editar si es elegible · Simular plazo vencido · Volver | La elegibilidad depende del servidor; origen estable | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Registrar factura manual | `/invoices/new` | DRIVER | Revisar · Ver rechazo de asignación · Cancelar | Campos ilustrativos. El servidor confirma asignación y permiso | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Escanear QR | `/invoices/scan` | DRIVER | Simular lectura · Cámara denegada · Código inválido · Volver | Solicitar cámara al iniciar el escaneo | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Cámara no disponible | `/invoices/scan · cámara denegada` | DRIVER | Reintentar · Registrar manualmente | Explicar cómo recuperar el acceso | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| No pudimos leer el QR | `/invoices/scan · QR inválido` | DRIVER | Escanear de nuevo · Volver | Mantener el origen de cada flujo | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Revisar datos del QR | `/invoices/scan/review` | DRIVER | Revisar confirmación · Ver rechazo de asignación · Escanear de nuevo | Formato y campos protegidos dependen de P3 | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Vehículo sin asignación válida | `/invoices/new · rechazo` | DRIVER | Volver a captura manual · Volver a QR | Conservar captura cuando sea seguro; impedir confirmación hasta resolver | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Confirmar registro | `/invoices/new · revisión` | DRIVER | Confirmar registro · Volver al listado | Vincular el botón Volver al origen de captura en la implementación | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Editar factura | `/invoices/:id/edit` | THIRD_PARTY_ADMIN, DRIVER | Guardar · Ver plazo vencido · Cancelar | DRIVER solo facturas propias MANUAL dentro de la ventana. Campos QR protegidos | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Edición fuera de plazo | `/invoices/:id · solo lectura` | THIRD_PARTY_ADMIN, DRIVER | Ver factura · Volver | El servidor decide el instante límite y la elegibilidad | [Facturas](../initial-invoices-app/specs/invoice-management/spec.md) |
| Parámetros | `/parameters` | APP_ADMIN | Editar ventana · Ver configuración ausente | Lectura global autorizada | [Parámetros](../initial-invoices-app/specs/configuration/spec.md) |
| Ventana de edición manual | `/parameters/manual-window` | APP_ADMIN | Guardar · Cancelar | Validar tipo y rango; mostrar el efecto temporal según P2 | [Parámetros](../initial-invoices-app/specs/configuration/spec.md) |
| Ventana de edición no disponible | `/parameters · sin configuración` | APP_ADMIN | Volver | La ausencia no amplía el derecho de edición | [Parámetros](../initial-invoices-app/specs/configuration/spec.md) |
| Auditoría | `/audit` | Pendiente | Ver evento · Acceso limitado | audit:read pendiente en la matriz. Visible en el catálogo | [Auditoría](../initial-invoices-app/specs/audit/spec.md) |
| Detalle de evento | `/audit/:id` | Pendiente | Volver | Mostrar solo datos permitidos por la política de auditoría | [Auditoría](../initial-invoices-app/specs/audit/spec.md) |
