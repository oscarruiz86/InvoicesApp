# Proposal

## Why

Los módulos repiten composición de encabezados, toolbars, filtros, tablas, paginación, diálogos y estados con variaciones visuales y responsive. Se necesita consolidar primero los componentes compartidos y migrar después los módulos para que todos sigan la referencia visual aprobada en el wireframe.

## What Changes

- Inventariar los patrones de UI existentes y acordar contratos para componentes compartidos reutilizables.
- Crear o completar componentes compartidos para listas, toolbar, filtros, chips aplicados, tabla/tarjetas móviles, paginación, formularios/detalles y estados de carga, error y vacío.
- Aplicar al sistema de componentes los estilos, jerarquía, interacciones y reglas responsive definidos en el wireframe interactivo y el estándar visual.
- Establecer en el proyecto la regla de trabajo de que todo ajuste visual se actualiza y revisa primero en el wireframe, antes de modificar su implementación.
- En escritorio, conservar el scroll normal del navegador y mantener el sidebar anclado bajo la barra superior dentro de una columna lateral que ocupa el alto disponible y llega hasta el footer. La navegación tendrá scroll interno solo si sus elementos desbordan; en móvil seguirá como drawer temporal y desplazará su contenido internamente solo si hace falta.
- Migrar los módulos en una secuencia controlada para que consuman los componentes compartidos, conservando sus permisos, reglas de negocio y flujos existentes.
- Actualizar la documentación visual con los componentes reutilizables, sus responsabilidades y su cobertura por módulo.
- Estandarizar las acciones de las tablas como botones de solo icono, con tooltip y nombre accesible; alinearlas a la izquierda y centrarlas verticalmente. Simplificar el detalle de empresas y terceros retirando acciones y paneles fuera de alcance.
- Mostrar listados de invitaciones y usuarios sin un selector de empresa permanente; colocar el filtro de empresa dentro del modal de filtros y añadirlo también al filtro de terceros.
- No volver a consultar un listado cuando se cierra o cancela un modal sin aplicar cambios; los filtros solo se consultan al aplicar cambios y las mutaciones exitosas sí actualizan los datos.
- Reutilizar un selector común de empresas dentro de filtros y flujos de creación; mostrar la empresa asociada después del correo en invitaciones y después de la razón social en terceros.
- Incluir una entrada de inicio de sesión para visitantes en Inicio, presentar invitaciones y pertenencias sin filtros activos ficticios al cargar y ofrecer la creación de invitaciones según permisos.
- Alinear Vehículos al contrato de tabla responsive; unificar la carga de Asignaciones también para administradores de terceros y extender a todo el ancho disponible las vistas de Roles y Parámetros.
- Mejorar la distribución adaptable del modal de filtros de invitaciones y mostrar las acciones de pertenencias que un administrador global puede ejecutar, sin controles deshabilitados engañosos.
- Completar la continuidad del shell al recargar Inicio, redirigir su acceso de visitante directamente al flujo OIDC de Keycloak y mostrar en `/login` mensajes solo cuando el estado lo requiera.
- Alinear los detalles de empresas y terceros; en el detalle de empresa, ubicar el estado después de Ciudad. Para APP_ADMIN, solicitar empresa al crear un tercero y guardar su relación de forma autorizada.
- Conservar el listado visible al cancelar la creación de empresas o terceros, mantener el encabezado de tabla cuando Invitaciones no tiene resultados, y mejorar la distribución de sus filtros.
- Usar acciones de solo icono con tooltip en Invitaciones, Usuarios vinculados y Parámetros; mantener el texto completo de los estados y eliminar mensajes o acciones de sesión redundantes.
- Presentar contextos seleccionables como tarjetas claras y unificar el esqueleto de carga en tablas, con un tratamiento específico para Roles y Parámetros.
- Mostrar Usuarios vinculados como tarjetas también en móvil para el listado global, normalizar la vista vacía con el aviso compartido antes de la tabla y retirar la acción de asociación duplicada bajo ese aviso.
- Recalcular por breakpoint el ancho de los encabezados y filas esqueleto para que las columnas visibles ocupen todo el ancho disponible, sin huecos por columnas ocultas.
- Mantener el shell de Inicio solo mientras se verifica una sesión potencialmente activa; al confirmar que no existe sesión, ocultar navbar y sidebar y ofrecer el acceso a Keycloak desde la vista pública.

## Capabilities

### New Capabilities

Ninguna. Se reutiliza la capacidad de diseño visual de la aplicación.

### Modified Capabilities

- `application-ui-design`: concretar la implementación coherente de patrones compartidos y exigir que cada ajuste visual se actualice y revise primero en el wireframe, conservando los comportamientos responsive y estados definidos.

## Impact

- Frontend: `frontend/src/shared/components`, tema MUI y páginas de presentación de Inicio, Empresas, Terceros, Conductores, Vehículos, Asignaciones, Facturas, Notificaciones, Parámetros, Roles, Usuarios e Invitaciones.
- Referencias: `frontend/docs/estandar-visual-y-wireframes.md` y `frontend/docs/wireframe-interactivo.html`.
- Puede requerir ajustar consultas de listado para filtrar terceros, invitaciones y pertenencias por empresa dentro del ámbito permitido. Se conservan las comprobaciones de autorización existentes y no se amplía acceso por cliente.
- Separar la landing pública en `/` del Inicio autenticado en `/home`; ajustar el selector de empresa en filtros de Terceros y habilitar selección y consulta por tercero en Invitaciones y Usuarios vinculados usando la empresa del borrador.
- Restaurar sesión OIDC en recargas directas de `/home`, permitir selección de empresas mientras se refresca el selector, alinear los filtros de Usuarios vinculados al wireframe y mostrar acciones con texto en las tarjetas móviles de Parámetros.
