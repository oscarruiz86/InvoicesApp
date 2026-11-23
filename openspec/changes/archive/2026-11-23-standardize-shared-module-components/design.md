# Design

## Context

Ver `proposal.md` para la motivación y `specs/application-ui-design/spec.md` para el contrato visual. El frontend usa React y MUI. Ya existen `AppLayout`, `PageHeader`, `DataTable`, `DataPagination`, `TableLoadingState` y `SuccessNotice`; la implementación debe inspeccionar y extender estas piezas antes de introducir equivalentes. El wireframe y `frontend/docs/estandar-visual-y-wireframes.md` son la fuente de composición y estilo.

## Goals / Non-Goals

**Goals:**

- Definir contratos y estilos compartidos antes de migrar páginas de módulos.
- Reutilizar los componentes existentes donde cubran el patrón; completar sus brechas sin crear duplicados con otro nombre.
- Migrar los módulos por grupos, manteniendo permisos, flujos, datos y comportamiento de negocio.
- Mantener consistentes teclado, foco visible, estados accesibles y presentación responsive.

**Non-Goals:**

- Cambiar las reglas de autorización, el ciclo de vida del dominio o la persistencia.
- Introducir operaciones de escritura de backend; se mantienen los contratos existentes para crear invitaciones y pertenencias.
- Añadir nuevas acciones de producto (por ejemplo, exportación) que no existan en el módulo.
- Rediseñar el wireframe durante la implementación; cambios de alcance visual requieren actualizar primero esa referencia y la especificación.

## Decisions

### 1. Extender el sistema compartido existente

Se mantienen React y MUI como base, y `frontend/src/shared/components` como ubicación de las piezas transversales. Antes de codificar, se verifica cada contrato existente para decidir si se reutiliza, se amplía o se reemplaza. No se crea un segundo encabezado, tabla o paginador si el componente actual puede soportar el wireframe.

**Alternativas consideradas:** construir componentes locales por módulo (repite la inconsistencia actual); incorporar una librería UI nueva (duplica dependencias y estilos sin necesidad).

### 2. Completar primero patrones de lista y formulario

La primera entrega de componentes compartidos cubre encabezado de página, toolbar de listado, diálogo de filtros y chips removibles, tabla desktop/tarjeta móvil, estado de fila, acciones de consultar/editar, ordenamiento móvil, paginación y estados de carga/error/vacío. La segunda cubre patrones de formulario y detalle, incluidos estructura, pie de acciones y metadatos de creación/edición. Las reglas concretas de prioridad de columnas, acciones disponibles y fecha visible se documentan junto al componente.

El toolbar admite solo acciones que la página provea; crear y filtrar se colocan según el wireframe, y el botón de ordenamiento modal solo aparece en móvil. La tabla no debe introducir scroll horizontal: oculta columnas secundarias y cambia a tarjetas en móvil. Los filtros avanzados se presentan en un diálogo y sus criterios aplicados en chips.

**Alternativas consideradas:** un componente monolítico de “página CRUD” que impone estructura a módulos distintos; componentes de presentación pequeños y componibles conservan flexibilidad sin duplicar los estilos.

### 3. Migrar las páginas después de validar los contratos

La migración empieza con un módulo de listado representativo para confirmar que los componentes compartidos cubren los casos reales. Luego avanza en grupos: operación (empresas, terceros, flota y asignaciones), facturación y notificaciones, administración (usuarios, invitaciones, roles y parámetros), y finalmente Inicio y otros contextos/cards. Cada página conserva sus datos, permisos, estados de dominio y acciones existentes, inyectándolos en los componentes compartidos.

Las diferencias por negocio se resuelven mediante composición, contenido y props explícitas. No se agregan condicionales acoplados a nombres de módulos dentro de componentes compartidos.

**Alternativas consideradas:** migrar todos los módulos de una sola vez (aumenta riesgo y dificulta detectar regresiones); adaptar uno por patrón y migrar por lotes permite corregir contratos antes de expandirlos.

### 4. Usar el wireframe como referencia comprobable

Antes de un ajuste visual de código, se actualiza y revisa el wireframe de la pantalla y sus estados responsive. Luego el tema MUI y las piezas compartidas implementan tipografía, color, espaciado, bordes, estados, orden y reglas responsive definidos allí. Si aparece una divergencia durante la implementación, el wireframe se revisa primero y el código sigue ese cambio. El prototipo HTML sirve como referencia visual, no como dependencia de runtime; los módulos no copian estilos desde el HTML.

**Alternativas consideradas:** cambiar estilos directamente en el código (el wireframe deja de representar la implementación); cargar el HTML como UI (no se integra con routing, accesibilidad ni datos reales).

### 5. Fijar la navegación lateral sin acoplarla al scroll de contenido

En escritorio, se conserva el scroll normal del documento y el sidebar usa `position: sticky` bajo la barra superior dentro de una columna de layout que se extiende hasta el footer. El fondo de la columna llena toda la altura del layout; el panel de navegación ocupa el alto visible disponible y usa `overflow-y: auto` solo cuando sus elementos desbordan. Así la barra de scroll del navegador desplaza el contenido principal sin sacar la navegación de vista, y el sidebar termina alineado con el footer. En móvil y en la previsualización móvil se mantiene el scroll normal de la página y el sidebar es un panel temporal superpuesto, con altura limitada y scroll interno cuando haga falta.

**Alternativas consideradas:** dejar el sidebar completamente en el flujo normal (se va con el contenido); usar `position: fixed` sin una columna de layout de altura completa (el fondo del sidebar no alcanza el footer y el panel se separa de su flujo); desplazar el panel principal dentro de un contenedor propio (impide usar la barra normal del navegador como pidió la revisión).

## Risks / Trade-offs

- [El contrato común no representa una excepción de negocio] → Mantener componentes componibles, validar cada tipo de página con un módulo representativo y dejar la lógica de negocio en el módulo.
- [Una migración cambia acciones o permisos por accidente] → Migrar solo presentación y conservar las puertas de autorización existentes; revisar cada acción contra la implementación previa.
- [Ocultar columnas elimina información importante en pantallas medianas] → Definir y documentar prioridad por tabla; garantizar consulta del registro desde la tarjeta móvil y evitar scroll horizontal.
- [Las páginas actuales tienen variaciones no cubiertas por el wireframe] → Registrar las excepciones antes de migrar y actualizar la referencia aprobada antes de codificar una variación persistente.
- [El menú supera la altura disponible o el sticky no considera la barra superior] → Limitar altura al viewport restante, conservar scroll interno y verificar menú corto/largo tanto en escritorio como en móvil.

## Migration Plan

1. Inventariar páginas y mapear cada patrón existente a componentes compartidos; decidir qué se conserva, amplía o crea y fijar props/estados.
2. Completar componentes base y estilos según wireframe; dejar cada componente listo antes de migrar el siguiente lote.
3. Ajustar el layout compartido para conservar el scroll del documento, extender la columna lateral hasta el footer y anclar el sidebar con scroll interno solo por desbordamiento; verificar moviendo la barra del navegador en páginas largas y con menús cortos/largos.
4. Migrar un listado representativo y corregir el contrato compartido con sus necesidades reales.
5. Migrar los módulos por lotes definidos arriba, verificando escritorio y móvil y preservando permisos/acciones.
6. Retirar composición y estilos duplicados, actualizar el inventario visual y revisar que todos los módulos cubiertos consuman las piezas compartidas.

La reversión se hace por lote: restaurar temporalmente la composición anterior de la página afectada, sin revertir componentes que ya utiliza otro módulo. No hay migración de datos ni cambios al esquema persistido.

La entrada de la aplicación separa una landing pública (`/`) del panel autenticado (`/home`). La raíz resuelve la sesión: durante inicialización conserva el shell y el aviso de verificación; después dirige al panel si hay sesión o presenta la landing sin navegación lateral. Los filtros por organización usan el selector compartido de empresa; el selector de terceros recibe la empresa seleccionada en el borrador del filtro y solo aplica consultas cuando el destino seleccionado está completo.

La inicialización OIDC usa `check-sso` mediante redirección del navegador al callback ya registrado para recuperar el estado de una sesión válida al abrir o actualizar `/home`, conservando la ruta sin depender de iframes que Keycloak puede bloquear por CSP. La ruta `/login` se reserva para el inicio de sesión explícito y no dispara una comprobación automática. El selector de empresas mantiene seleccionables las opciones ya cargadas durante una actualización. Las acciones móviles de Parámetros usan botones con texto, y los filtros de Usuarios siguen la composición del wireframe: empresa/búsqueda completas, tipo/tercero completos y rol/estado en dos columnas.

Las columnas de empresa amplían únicamente las respuestas de lectura de listados con nombres de organizaciones vinculadas, filtradas por el ámbito autorizado. No se almacenan nuevos datos ni se amplía el permiso de consulta.

## Open Questions

Ninguna que impida definir el enfoque. La prioridad concreta de columnas se decidirá por tabla durante el inventario, manteniendo la regla común de no crear scroll horizontal.
