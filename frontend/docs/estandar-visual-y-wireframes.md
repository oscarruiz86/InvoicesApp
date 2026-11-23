# Estándar visual de módulos

## Hallazgos e inventario

Las pantallas comparten tema Material UI, navegación lateral, tablas, paginación y avisos. La inconsistencia aparece en la composición: cada módulo ubica y espacia títulos, filtros, acciones, estados, tablas y diálogos de forma distinta. También hay vistas móviles que cambian entre tarjetas y tablas horizontales.

El prototipo navegable, con cambio de módulos, búsqueda, filtros, paginación y diálogos, está en [wireframe-interactivo.html](./wireframe-interactivo.html).

La experiencia de entrada separa una landing pública en `/` del panel autenticado en `/home`. La landing no presenta navbar ni sidebar; el inicio autenticado conserva el shell y muestra módulos disponibles y estado de la API. La ruta `/home` mantiene un estado visible de verificación durante la inicialización OIDC.

Entregas de notificaciones conserva una tabla con encabezados y paginación a 1280 px, y presenta tarjetas apiladas a 360 px con tipo, fecha, estado, canal, intentos, destinatario enmascarado, resultado y acción de detalle. Los esqueletos de carga se alinean solo con las columnas visibles para llenar el ancho de la tabla; error y vacío mantienen sus mensajes y acciones de recuperación.

## Regla para cambios visuales

Todo ajuste visual debe pasar primero por el wireframe de la pantalla afectada. Actualiza y revisa allí composición, estilos y estados responsive antes de modificar componentes o estilos del frontend. La implementación debe coincidir con el wireframe revisado; si aparece una diferencia necesaria, actualiza y revisa primero el wireframe y después el código. Esta regla aplica a todos los módulos y tamaños de pantalla; los cambios funcionales sin efecto visual no requieren modificar el wireframe.

| Patrón | Reutilización actual | Referencia acordada | Módulos donde aplica |
| --- | --- | --- | --- |
| Marco de aplicación | `AppLayout` | Barra superior, navegación lateral y área central con ancho máximo de 1600 px; Roles y Parámetros pueden expandirse a todo el ancho del contenido | Todos los módulos autenticados |
| Encabezado de página | `PageHeader` compartido aplicado a páginas principales; algunos estados de acceso usan encabezados propios | Título `h1`, descripción y acciones opcionales con divisor y adaptación móvil | Inicio, empresas, terceros, conductores, vehículos, asignaciones, facturas, entregas de notificaciones, parámetros, roles, usuarios e invitaciones |
| Barra de lista y filtros | `DataTable` compartida; toolbar y filtros todavía compuestos localmente por página | Acción principal y filtro en toolbar; criterios en diálogo; chips aplicados removibles | Empresas, terceros, flota, asignaciones, facturas, entregas de notificaciones, usuarios vinculados e invitaciones |
| Tabla y fila móvil | `DataTableSurface`, `DataTableAction`, `Table` MUI y algunas tarjetas locales | Consultar/editar según permiso; orden por columna; ocultar columnas secundarias sin scroll horizontal; tarjeta accesible en móvil | Listados de operación, administración y configuración |
| Paginación | `DataPagination` compartida, con opciones compactas por pantalla | Primera/anterior/siguiente/última, actualizar como icono junto a controles, conteo y tamaño de página adaptable | Listados paginados y selectores paginados |
| Formularios y detalles | Diálogos MUI locales y contenido por módulo | Título, campos en una columna móvil/dos columnas amplias, errores dentro del diálogo y acciones al pie | Empresas, terceros, facturas, flota, parámetros, roles e invitaciones |
| Estado de carga, error y vacío | `Alert`, `TableLoadingState`, `CircularProgress` combinados según página | Indicador de carga; error con reintento; vacío explicado con siguiente paso | Todos los módulos con datos remotos |
| Tarjetas de acceso | `Paper` y `Card` definidos localmente | Tarjeta con título, resumen y acción al pie; cuadrícula que pasa de una a dos columnas | Inicio, selector de organización y vistas móviles |
| Entrada a la aplicación | Landing pública e Inicio autenticado | Landing sin shell; Inicio autenticado con accesos por permiso, estado de API y shell persistente al verificar sesión | Visitantes y personas autenticadas |

## Matriz de reutilización por módulo

La app ya comparte `PageHeader`, `DataTable`, `DataTableSurface`, `DataTableAction`, `DataPagination`, `TableLoadingState` y `SuccessNotice` en varias páginas. La fase de implementación debe ampliar estas bases antes de crear duplicados. Los toolbar, filtros, chips y la mayoría de los formularios/detalles siguen compuestos localmente.

| Módulo/página | Componentes compartidos actuales | A completar o conservar local |
| --- | --- | --- |
| Inicio | `PageHeader`, `ModuleAccessCard` | Tarjetas de acceso comparten estructura; el panel de salud conserva contenido y estados propios |
| Empresas | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `RecordMetadata`, `DataPagination`, `TableLoadingState`, `ListFeedback`, `SuccessNotice` | Formulario y detalle de empresa |
| Terceros | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `RecordMetadata`, `DataPagination`, `TableLoadingState`, `ListFeedback`, `SuccessNotice` | Columna Empresa inmediatamente después de Razón social, basada en asociaciones visibles para el ámbito; filtro de empresa en el diálogo |
| Conductores | `PageHeader`, `DataTable`, `DataTableSurface`, `DataTableAction`, `DataTableSortHeader`, `DataPagination`, `TableLoadingState`, `SuccessNotice` | Datos de identidad de solo lectura y consulta del conductor |
| Vehículos | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `FormDialog`, `RecordMetadata`, `ListFeedback`, `DataPagination`, `TableLoadingState`, `SuccessNotice` | Consulta y reglas de flota |
| Asignaciones | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `ListFeedback`, `DataPagination`, `TableLoadingState`, `SuccessNotice` | Historial y confirmación propios de asignaciones |
| Facturas | `PageHeader`, `DataTable`, `DataTableSurface`, `DataTableSortHeader`, `DataPagination`, `TableLoadingState`, `SuccessNotice` | Captura QR/manual, edición y filtros de factura |
| Entregas de notificaciones | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `StatusChip`, `ListFeedback`, `FormDialog`, `DataPagination`, `TableLoadingState` | No exponer contenido ni credenciales |
| Usuarios vinculados | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `FormDialog`, `DataPagination`, `TableLoadingState`, `SuccessNotice`, `CompanySelectionField` | APP_ADMIN ve todas las pertenencias sin chips predeterminados y puede asociar una cuenta tras elegir una empresa |
| Invitaciones | `PageHeader`, `DataTable`, `ListToolbar`, `AppliedFilters`, `ListFilterDialog`, `MobileSortControl`, `StatusChip`, `FormDialog`, `DataPagination`, `TableLoadingState`, `SuccessNotice`, `CompanySelectionField` | Empresa después de Correo; selector común en filtros y creación; destino de creación no modifica el filtro del listado |
| Invitaciones recibidas | `PageHeader`, `DataPagination`, `SuccessNotice` | Estados y acciones de aceptar/rechazar |
| Parámetros | `PageHeader`, `DataTable`, `DataTableSurface`, `DataPagination`, `FormDialog`, `ListFeedback`, `SuccessNotice` | Catálogo se extiende por todo el ancho disponible; formulario conserva reglas de ámbito y auditoría |
| Roles y permisos | `PageHeader`, `ListFeedback` | Matriz se extiende por todo el ancho disponible; formularios y confirmaciones conservan su interacción de dominio |
| Acceso | `PageHeader`, `Button`, ruta de autenticación existente | Inicio muestra “Iniciar sesión” solo a visitantes |
| Inicio y autenticación | `AppLayout`, `AuthenticationStore`, flujo OIDC existente | El shell permanece en Inicio durante la inicialización; el CTA inicia Keycloak directamente; `/login` solo anuncia errores/estados excepcionales |
| Creación de terceros | `CompanySelectionField`, `CompanyPickerDialog`, `FormDialog` | APP_ADMIN selecciona empresa destino y el servidor crea el tercero y la relación inicial bajo autorización |
| Detalle de empresa y tercero | `FormDialog`, `StatusChip`, `RecordMetadata` | Dos columnas en escritorio, una en móvil; Estado después de Ciudad; mismo tratamiento en ambos módulos |
| Tabla vacía de invitaciones | `DataTableSurface`, `ListFeedback`, `TableLoadingState` | Encabezados conservados y mensaje vacío dentro del cuerpo de la tabla |
| Contextos | `OrganizationCard`, `Card`, `Chip` | Una tarjeta por organización/contexto, con tipo, roles y CTA de selección; sin acción de cerrar sesión en esta pantalla |

En tablas responsive, prioridad de columnas: identidad/nombre principal y estado son esenciales; referencia o correo se conservan si caben; fechas, descripción y metadatos secundarios se ocultan primero. Las acciones permitidas siguen accesibles en cada fila o tarjeta. Ninguna pantalla de escritorio debe introducir scroll horizontal.

## Contratos de componentes compartidos

| Componente | Contrato de presentación | Regla responsive y de estado |
| --- | --- | --- |
| `PageHeader` | `title`, `description?`, `actions?`, `tabIndex?` | Un `h1`; acciones debajo en móvil y alineadas al encabezado en escritorio |
| `ListToolbar` | Acciones del módulo como contenido y `mobileSortAction?` | Acciones a la derecha con salto de línea; ordenar solo se muestra en móvil |
| `AppliedFilters` | `filters: { key, label }[]`, `onRemove(key)`, `onClear?` | Chips accesibles removibles; mensaje “Ninguno” cuando no hay criterios |
| `ListFilterDialog` | `open`, `title`, `children`, `onClose`, `onApply`, `busy?` | Campos en una columna móvil/dos columnas amplias; botones al pie; carga y foco accesibles |
| `MobileSortControl` | `fields`, `sortBy`, `direction`, `onChange` | Botón solo de icono en móvil; el modal aplica columna y dirección |
| `DataTable` | `toolbar?`, `pagination?`, `loading?`, `children` | Mantiene ancho mínimo cero y anuncia carga con `aria-busy` |
| `DataTableSurface` | `children`, `loading?`, `sx?` | Ajuste dentro del ancho disponible, columnas secundarias ocultas y sin scroll horizontal |
| `DataTableAction` | `label`, `onClick`, `disabled?`, `primary?`, `children` | Área táctil mínima y nombre accesible obligatorio |
| `DataPagination` | `page`, `pageSize`, `total`, handlers, `onRefresh?`, `compact?` | Primero/anterior/siguiente/último, refrescar después de páginas; conteo y tamaño se apilan en móvil |
| `StatusChip` | `label`, `tone: success, warning, danger, neutral or info` | Color semántico consistente y texto visible, no depende solo del color |
| `ListFeedback` | `kind: loading, error or empty`, `title`, `children?`, `action?` | Mensajes de carga, error o vacío con recuperación opcional, lectura accesible y texto adaptable |
| `RecordMetadata` | `createdAt?`, `updatedAt?`, `formatDate` | Muestra edición si existe; si no, creación |
| `ModuleAccessCard` | `title`, `description`, `action` | Tarjeta de acceso con altura y jerarquía uniformes; el contenido de negocio permanece en la página |
| `CompanySelectionField` | `label?`, `value?`, `placeholder?`, `onClick`, `disabled?` | Entrada común del selector existente, con estado visible y nombre accesible; consulta, permisos y paginación siguen en la página dueña |
| `FormDialog` | `open`, `title`, `children`, `actions`, `onClose`, `maxWidth?` | Contenido adaptable, error dentro del diálogo, acciones al pie y cierre accesible |
| `TableLoadingState` / `ListFeedback` / `SuccessNotice` | Esqueleto de tabla con `columnSx?` y mensajes de carga, error, vacío o éxito | Mantienen altura, contraste y lectura por tecnologías de asistencia; el esqueleto respeta las columnas ocultas por breakpoint y el error acepta reintento contextual |

Al cargar una lista, se conserva la estructura del encabezado de página y de tabla. Las filas muestran barras esqueleto con la misma separación y columnas visibles del resultado; la carga móvil usa tarjetas esqueleto. Roles y Parámetros muestran el mismo patrón en la primera consulta y la política de Roles permanece visible durante una recarga en segundo plano.

Los componentes aceptan contenido del módulo, pero no deciden permisos ni reglas de negocio. Cada página provee únicamente las acciones que realmente implementa.

## Wireframes de referencia

Los esquemas muestran orden y jerarquía, no estilos finales ni contenido de negocio.

### 1. Marco de aplicación

```text
┌──────────────────────────────────────────────────────────────┐
│ ☰   Invoices App                                  Contexto ▾ │
├────────────────┬─────────────────────────────────────────────┤
│ Navegación     │                                             │
│                │             Contenido del módulo           │
│ • Inicio       │             ancho máximo 1600 px            │
│ • Facturas     │                                             │
│ • Empresas     │                                             │
│                │                                             │
├────────────────┴─────────────────────────────────────────────┤
│ Invoices App                                                  │
└──────────────────────────────────────────────────────────────┘
```

En móvil, el menú pasa a un panel temporal y el contenido ocupa el ancho disponible.

En escritorio se conserva el scroll normal del documento: al desplazar la página, la navegación lateral permanece anclada debajo de la barra superior y su columna de fondo llega hasta el footer. El menú solo tiene scroll interno cuando sus elementos no caben en el alto disponible. En móvil se conserva el scroll de página y el panel temporal desplaza su contenido internamente solo si desborda.

### 2. Encabezado de módulo

```text
┌──────────────────────────────────────────────────────────────┐
│ Título de la página                         [Acción principal]│
│ Descripción breve opcional                                   │
├──────────────────────────────────────────────────────────────┤
```

En móvil, la acción se ubica debajo del título y puede ocupar el ancho disponible.

### 3. Lista, filtros y acciones

```text
┌──────────────────────────────────────────────────────────────┐
│ Filtros aplicados: [Búsqueda: … ×] [Estado: … ×]            │
│ [Crear registro]                                 [Filtros]   │
├──────────────────────────────────────────────────────────────┤
│ Aviso de error, carga o resultados vacíos (cuando aplique)   │
├──────────────────────────────────────────────────────────────┤
│ Tabla de registros                                           │
│ Identificador | Datos | Estado | Fecha | Acciones             │
├──────────────────────────────────────────────────────────────┤
│ [↻] « ◂ 1  2  3 ▸ »  Registros 1–20 de 85     Tamaño ▾   │
└──────────────────────────────────────────────────────────────┘
```

La búsqueda y el estado se configuran en el diálogo de filtros; los filtros activos aparecen como chips removibles. En móvil, el toolbar agrega un botón de orden que abre un modal con columna y dirección. La acción y filtros se ajustan a varias líneas, cada fila se presenta como tarjeta y la paginación apila conteo y controles.

### 4. Tabla y tarjeta móvil

```text
Escritorio                               Móvil
┌────────┬───────────┬────────┬──────┐   ┌──────────────────────┐
│ Nombre │ Referencia│ Estado │ ⋯    │   │ Nombre principal    │
├────────┼───────────┼────────┼──────┤   │ Referencia           │
│ …      │ …         │ …      │ ⋯    │   │ Estado    [Consultar]│
└────────┴───────────┴────────┴──────┘   └──────────────────────┘
```

### 5. Formulario o detalle

```text
          ┌────────────────────────────────────────┐
          │ Crear / editar / detalle                │
          ├────────────────────────────────────────┤
          │ Campo                 Campo            │
          │ Campo                 Campo            │
          │ Aviso o error                           │
          ├────────────────────────────────────────┤
          │                       [Cancelar] [Guardar]│
          └────────────────────────────────────────┘
```

En móvil, campos en una columna y botones ajustables al ancho. Los detalles de solo lectura usan el mismo diálogo y sustituyen los campos por pares etiqueta/valor.

En vistas y ediciones se muestra la fecha de edición si existe; en caso contrario se muestra la fecha de creación.

### 6. Carga, error y vacío

```text
┌──────────────────────────────────────────────────────────────┐
│ [Indicador] Cargando registros…                              │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ No se pudo cargar la lista.                    [Reintentar]  │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ No hay registros para estos filtros.                         │
│ Ajusta la búsqueda o limpia los filtros.       [Limpiar]     │
└──────────────────────────────────────────────────────────────┘
```

### 7. Inicio y tarjetas de acceso

```text
┌──────────────────────────────────────────────────────────────┐
│ Inicio                                                       │
│ Accesos disponibles para este rol y contexto.                │
├──────────────────────────────┬───────────────────────────────┤
│ Empresas                     │ Conexión con la API           │
│ Resumen del módulo           │ Estado del servicio           │
│ [Abrir empresas]             │ [Comprobar conexión]          │
└──────────────────────────────┴───────────────────────────────┘
```

En móvil, las tarjetas se muestran en una columna.

### 8. Esqueleto de tabla y carga administrativa

```text
Título del módulo                         [acciones]
Filtros aplicados: [chips]
┌──────────────────────────────────────────────────────────────┐
│ Columna A       │ Columna B       │ Estado       │ Acciones │
├─────────────────┼─────────────────┼──────────────┼──────────┤
│ ▰▰▰▰            │ ▰▰▰             │ ▰▰           │ ▰▰       │
│ ▰▰▰             │ ▰▰▰▰            │ ▰▰           │ ▰▰       │
│ ▰▰▰▰            │ ▰▰              │ ▰▰▰          │ ▰▰       │
└──────────────────────────────────────────────────────────────┘
```

La carga conserva los encabezados reales y reserva altura por fila. Los anchos de las columnas visibles se recalculan por breakpoint para ocupar el 100% de la tabla, tanto el encabezado como el esqueleto. En móvil se muestran tres tarjetas esqueleto y los encabezados no generan espacios vacíos por columnas ocultas. Roles usa la misma matriz de dos columnas que sus resultados; Parámetros conserva el encabezado de cinco columnas. Si Roles está actualizando una política ya cargada, la matriz vigente permanece disponible.

### 9. Invitaciones sin resultados y filtros

```text
┌──────────────────────────────────────────────────────────────┐
│ No hay empresas que coincidan con la consulta.               │
│ Ajusta la búsqueda o limpia los filtros.                     │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Correo │ Empresa │ Rol │ Estado │ Entrega │ ... │ Acciones │
└──────────────────────────────────────────────────────────────┘

Filtros de invitaciones
┌───────────────────────────┬───────────────────────────────┐
│ Empresa (selector común, ocupa todo el ancho)               │
├───────────────────────────┼───────────────────────────────┤
│ Correo                    │ Rol                           │
│ Estado                    │ Entrega                       │
│ Tipo de organización (ocupa todo el ancho)                   │
│ Tercero (cuando aplica)                                    │
└───────────────────────────┴───────────────────────────────┘
```

En escritorio las acciones de la tabla son solo iconos con tooltip y los estados se muestran completos. El aviso de resultado vacío se presenta antes de la tabla; los encabezados permanecen visibles en escritorio. En Usuarios vinculados se reutiliza el mismo aviso y no se repite la acción de asociación debajo del mensaje vacío (la acción autorizada se conserva en el toolbar). Los filtros se distribuyen en filas parejas; en móvil pasan a una columna.

### 11. Usuarios vinculados en móvil y continuidad de sesión

```text
┌─────────────────────────────────────────────────────┐
│ Usuarios                       [Asociar] [Filtro]   │
│ Filtros aplicados: Ninguno                           │
├─────────────────────────────────────────────────────┤
│ Ana Pérez                                            │
│ Documento: CC · 123456                               │
│ Empresa: Transportes Andinos                         │
│ Estado: Activo                    Roles: Admin.      │
│ [Consultar] [Suspender] [Asignar/Quitar rol]         │
└─────────────────────────────────────────────────────┘
```

Las tarjetas se muestran para la lista global APP_ADMIN y para listas filtradas por empresa; no se condicionan a que exista un `companyId` local. Si no hay resultados, se muestra antes de la superficie de tabla el aviso compartido: “No hay empresas que coincidan con la consulta. Ajusta la búsqueda o limpia los filtros.” No se duplica la acción “Asociar usuario” en ese estado.

Durante la inicialización OIDC, Inicio conserva el shell y muestra “Verificando sesión…” para evitar que parezca una pérdida de sesión. Cuando la sesión termina como anónima, Inicio se presenta sin navbar ni sidebar y ofrece Iniciar sesión. La carga tabular mantiene etiquetas de columna y distribuye todo el ancho entre las columnas visibles; las columnas ocultas no dejan espacios reservados.

### 10. Detalles y selección de contexto

```text
Detalle de empresa / tercero
┌──────────────────────────────┬───────────────────────────────┐
│ Tipo de documento            │ Número                        │
│ Razón social                 │ Correo                        │
│ Teléfono                     │ Dirección                     │
│ País                         │ Departamento                  │
│ Ciudad                       │ Fecha de creación/edición     │
│ Estado                       │                               │
└──────────────────────────────┴───────────────────────────────┘

Selecciona una organización
┌──────────────────────────────┬───────────────────────────────┐
│ Empresa · nombre             │ Empresa · nombre              │
│ Roles disponibles            │ Roles disponibles             │
│ [Usar este contexto]         │ [Usar este contexto]          │
└──────────────────────────────┴───────────────────────────────┘
```

El detalle de tercero usa la misma distribución que el de empresa. La administración global también es una tarjeta de contexto. El selector no presenta la acción Cerrar sesión.

## Ajustes aplicados

- Se agregó `PageHeader` para compartir título accesible, descripción opcional, acciones opcionales, divisor y adaptación a móvil.
- Se aplicó el encabezado a las páginas principales de los módulos y a las vistas de detalle de terceros; el foco programático de la página de vehículos se conserva.
- Se centró el área principal y se limitó su ancho para evitar líneas excesivamente largas en monitores amplios.
- En el prototipo, el toolbar usa botones solo con iconos y el botón de consulta está disponible en cada fila. Las columnas secundarias se ocultan en espacios limitados y la tabla se adapta sin desplazamiento horizontal.
- El prototipo incluye un selector para previsualizar el diseño en un marco móvil, navegación de tipo panel lateral y pie al fondo de la página.
- Se mantienen los componentes compartidos existentes (`AppLayout`, `DataTable`, `DataTableSurface`, `DataPagination`, `SuccessNotice` y el tema MUI) como piezas base para los siguientes refactors.
- Se añadieron contratos compartidos para toolbar, filtros aplicados, diálogo de filtros, orden móvil, estados, metadatos, diálogos de formulario y tarjetas de acceso. Empresas, Terceros, Conductores, Vehículos, Asignaciones, Facturas, Notificaciones, Invitaciones, Usuarios vinculados e Inicio reutilizan estos contratos donde aplican; Roles, Invitaciones recibidas y Parámetros mantienen sus controles de dominio con la base compartida.
- La superficie común de tabla limita el ancho al contenedor y oculta el desbordamiento horizontal; las páginas deben ocultar columnas secundarias y presentar tarjetas móviles antes de usarla.
- Las acciones en cada fila de escritorio usan solo iconos, tooltip y nombre accesible; el grupo se alinea a la izquierda y queda centrado verticalmente. Las tarjetas móviles conservan etiquetas visibles cuando mejoran la claridad táctil.
- La selección de empresa para terceros, invitaciones y usuarios vinculados se ofrece en el modal de filtros, no como control permanente encima del listado. El alcance de datos sigue limitado por la autorización del backend.
- En filtros de Terceros, Empresa aparece antes de la búsqueda y ocupa todo el ancho. En Invitaciones y Usuarios vinculados, el filtro permite elegir siempre tipo Tercero; el selector consulta terceros con la empresa que está seleccionada en el borrador del modal. Usuarios vinculados envía empresa, tipo y tercero al servicio al aplicar el filtro.
- En el modal de Usuarios vinculados, Empresa y búsqueda ocupan el ancho completo, Tipo de organización y Tercero ocupan filas completas, y Rol/Estado se distribuyen en dos columnas. En las tarjetas móviles de Parámetros, las acciones muestran texto visible; la tabla de escritorio conserva iconos con tooltip.
- El selector compartido de empresas conserva las opciones seleccionables mientras actualiza resultados; el backend filtra Terceros por `relatedCompanyId` cruzando las relaciones de empresa.
- La verificación OIDC en una recarga usa `check-sso` con redirección del navegador al callback registrado para restaurar la sesión vigente y conservar la ruta, sin depender de iframes que Keycloak puede bloquear por CSP.
- Entregas de notificaciones se validó visualmente a 360 px y 1280 px con datos, filtros, detalle, carga, error y vacío; los campos operativos completos permanecen en las tarjetas móviles y las columnas esqueleto usan el ancho de las columnas visibles.
- La landing pública vive en `/`; el panel con accesos y conexión de API vive en `/home`. Los visitantes no ven el navbar ni el sidebar. La navegación autenticada usa `/home` como destino de Inicio.
- Cancelar un modal de filtros o aplicar valores idénticos conserva los datos visibles sin una petición nueva. Limpiar dentro del diálogo solo cambia el borrador hasta aplicar.
- Los detalles de empresas y terceros son de consulta y solo muestran la acción Cerrar; cambios de estado y edición se mantienen en las acciones autorizadas de la lista.
- Inicio conserva navbar y sidebar durante la inicialización OIDC; el CTA para visitantes llama al inicio de sesión de Keycloak. La pantalla `/login` presenta mensajes de error únicamente cuando el estado real los justifica.
- Al cancelar la creación de una empresa o un tercero se recupera el snapshot de la lista y no se solicita otra página de datos. Para APP_ADMIN, el servidor guarda el tercero y su relación inicial con la empresa elegida en la misma operación.
- Las acciones de Invitaciones, Usuarios vinculados y Parámetros usan botones icon-only con tooltip; los estados de invitación permanecen completos y sin truncar.
- Los detalles de empresa y tercero comparten distribución de dos columnas y el estado queda después de Ciudad. El estado vacío de Invitaciones conserva los encabezados y ocupa una fila de mensaje.
- El selector de organización muestra cada destino como tarjeta y no ofrece cerrar sesión; el perfil omite el texto explicativo de identidad que no ayuda a la gestión del perfil.
