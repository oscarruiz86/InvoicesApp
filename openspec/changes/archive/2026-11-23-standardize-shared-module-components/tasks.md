# Tasks

## 1. Wireframe como paso previo

- [x] 1.1 Actualizar y revisar primero los wireframes de escritorio y móvil de los patrones incluidos en esta propuesta; verificar que todos los ajustes visuales planificados tienen referencia aprobada antes de tocar estilos o componentes del frontend.

## 2. Inventario y contratos compartidos

- [x] 2.1 Revisar las páginas de presentación y documentar por módulo qué piezas existentes se reutilizan, amplían o reemplazan; verificar que el inventario cubre los módulos enumerados en `frontend/docs/estandar-visual-y-wireframes.md`.
- [x] 2.2 Definir las props, estados, accesibilidad y reglas responsive de toolbar/filtros, tabla/tarjetas, paginación, formularios/detalle y estados async; verificar que cada contrato se mapea a un wireframe y no duplica un componente existente.
- [x] 2.3 Actualizar el estándar visual con la matriz de reutilización, excepciones por módulo y prioridad de columnas; verificar que el documento permite identificar cada componente y sus consumidores.

## 3. Construcción de componentes base

- [x] 3.1 Completar los componentes compartidos existentes de encabezado, toolbar y filtros con las acciones que provea cada página, chips removibles, modal de orden móvil y foco accesible; verificar sus interacciones y estados con las vistas desktop y móvil del wireframe.
- [x] 3.2 Completar tabla y tarjetas responsive, estados de fila, acciones de consultar/editar y paginación con actualización al final; verificar que no aparece scroll horizontal y que las acciones mantienen etiquetas accesibles.
- [x] 3.3 Unificar patrones compartidos de formularios/detalles y metadatos de auditoría; verificar en escritorio y móvil que edición muestra fecha de edición y, si no existe, fecha de creación.
- [x] 3.4 Unificar carga, error, vacío y avisos con una acción de recuperación cuando corresponda; verificar cada estado visualmente en una pantalla de listado.
- [x] 3.5 Ajustar el layout de escritorio para conservar el scroll normal del documento, extender el fondo lateral hasta el footer y anclar el sidebar dentro de esa columna; verificar con la barra del navegador en una página larga y con menús cortos/largos. Confirmar que móvil conserva el drawer y el scroll de página. Verificado en una página larga en escritorio y con el drawer móvil; el documento desplaza normalmente, el pie queda al final y el menú puede desplazarse internamente si no cabe.

## 4. Migración piloto y módulos operativos

- [x] 4.1 Migrar un listado representativo a los nuevos contratos compartidos y ajustar sus brechas sin lógica específica del módulo dentro de los componentes; verificar paridad de acciones, permisos y estados con el comportamiento previo.
- [x] 4.2 Migrar Empresas, Terceros, Conductores, Vehículos y Asignaciones a toolbar, filtros, tabla/tarjetas, paginación y estados compartidos; verificar cada pantalla en escritorio y móvil contra el wireframe.
- [x] 4.3 Actualizar el inventario visual con consumidores y excepciones confirmadas de este lote; verificar que las páginas migradas ya no dupliquen composición o estilos cubiertos.

## 5. Migración de facturación y notificaciones

- [x] 5.1 Migrar Facturas y Notificaciones a los componentes compartidos conservando captura/edición, permisos y estados propios; verificar que las acciones y mensajes de dominio siguen disponibles.
- [x] 5.2 Verificar visualmente los listados y diálogos de este lote a 360 px y 1280 px, incluida carga, error y vacío cuando apliquen; registrar excepciones aprobadas en el estándar visual. Notificaciones se verificó con el componente real en un harness local temporal: tabla/esqueletos a 1280 px y tarjetas, filtros, detalle, error y vacío a 360 px; la ruta protegida no estaba disponible con el rol activo.

## 6. Migración de administración y parámetros

- [x] 6.1 Migrar Usuarios, Invitaciones, Roles y Parámetros a los componentes compartidos conservando sus controles y permisos existentes; verificar formularios, consulta, filtros y acciones por página.
- [x] 6.2 Actualizar el inventario y wireframes para reflejar los componentes administrativos reutilizados; verificar consistencia responsive a 360 px y 1280 px.

## 7. Integración y cierre

- [x] 7.1 Aplicar encabezados, tarjetas y estados compartidos a Inicio y demás vistas de contexto cubiertas, sin añadir acciones de negocio inexistentes; verificar jerarquía, permisos y comportamiento adaptable.
- [x] 7.2 Retirar estilos y composiciones duplicadas que ya sustituyeron los componentes comunes; verificar con búsqueda que no queden implementaciones paralelas para los patrones migrados. Se revisaron consumidores y usos de `DataTableSurface`, `DataPagination`, `ListFilterDialog`, `AppliedFilters` y `FormDialog` en los módulos de listado migrados; las tablas que permanecen contienen filas propias del dominio.
- [x] 7.3 Ejecutar las verificaciones existentes de frontend y revisar el conjunto de módulos contra la especificación y el wireframe; registrar el resultado y corregir diferencias visuales, accesibilidad o regresiones antes de completar el cambio.

## 8. Ajustes de filtros y detalle

- [x] 8.1 Actualizar el wireframe y el estándar visual con filtros de empresa en modal, listado sin selector persistente, acciones icon-only con tooltip y detalle simplificado; verificar escritorio y móvil antes de aplicar cambios a la UI.
- [x] 8.2 Migrar tablas de empresas y terceros a acciones icon-only alineadas a la izquierda; retirar las acciones de detalle no solicitadas y el panel de relación de terceros.
- [x] 8.3 Mover la selección de empresa al modal de filtros de terceros, invitaciones y pertenencias; conservar el ámbito autorizado y mostrar el listado por defecto sin selector persistente.
- [x] 8.4 Evitar recargas al cerrar/cancelar filtros sin cambios y al cerrar detalles; refrescar después de aplicar filtros distintos o completar una mutación.

## 9. Ajustes de cobertura y administración

- [x] 9.1 Actualizar primero el wireframe para login desde Inicio, selector reutilizable de empresas, columnas de empresa, carga inicial sin chips ficticios, modal de invitación adaptable, acciones APP_ADMIN y vistas administrativas a ancho completo.
- [x] 9.2 Consolidar el selector de empresas y usarlo en filtros/destinos de invitaciones y pertenencias sin alterar el listado al seleccionar destino de creación.
- [x] 9.3 Añadir empresas asociadas a listados de Terceros e Invitaciones mediante datos reales autorizados y mostrarlas en tarjetas móviles.
- [x] 9.4 Completar Inicio, Vehículos, Asignaciones, Roles, Parámetros, pertenencias e invitaciones según wireframe y permisos; eliminar indicadores deshabilitados que no correspondan.
- [x] 9.5 Actualizar estándar visual y escenarios de OpenSpec con el resultado y documentar la cobertura final por módulo.

## 10. Continuidad, detalles y estados de carga

- [x] 10.1 Actualizar wireframe desktop/móvil para shell de Inicio durante recarga, acceso Keycloak, detalles de Empresa/Tercero, selector de empresa para creación, tabla vacía de Invitaciones, tarjetas de contexto y estados esqueleto de tabla.
- [x] 10.2 Mantener navbar/sidebar en Inicio durante inicialización de sesión, conectar el CTA de visitante directamente con Keycloak y contextualizar los mensajes de `/login`.
- [x] 10.3 Restaurar snapshots de Empresas y Terceros al cancelar creación; exigir empresa al APP_ADMIN y registrar tercero más relación autorizada en una operación del servidor.
- [x] 10.4 Alinear detalles, distribución del modal de filtros de Invitaciones y vista vacía con encabezados; conservar íntegro el texto de estados.
- [x] 10.5 Convertir acciones de Invitaciones, Usuarios vinculados y Parámetros a iconos con tooltip, retirar textos de perfil y acción de logout del selector, y presentar contextos como tarjetas.
- [x] 10.6 Mejorar el componente compartido de carga tabular y usar esqueletos de columnas/filas en Roles y Parámetros, manteniendo la matriz durante recargas.
- [x] 10.7 Actualizar el estándar visual y revisar el diff. La comprobación visual y ejecución de pruebas se mantienen pendientes hasta que se soliciten explícitamente.
- [x] 10.8 Actualizar wireframe/especificación para los estados de sesión, vacío administrativo y ancho responsive de encabezados antes de cambiar frontend.
- [x] 10.9 Mostrar Usuarios vinculados como tarjetas en móvil también para APP_ADMIN global, estandarizar el vacío antes de tabla y quitar CTA duplicado.
- [x] 10.10 Limitar navbar/sidebar de Inicio a sesión autenticada o inicialización OIDC y mostrar el estado de verificación durante la carga.
- [x] 10.11 Ajustar anchos responsivos de columnas visibles para conservar encabezados y filas esqueleto a ancho completo.

## 11. Landing, Inicio y filtros por organización

- [x] 11.1 Actualizar wireframe y estándar con landing pública separada de Inicio autenticado, filtros de empresa antes de búsqueda y selección de tercero desde filtros; revisar escritorio y móvil antes de implementar.
- [x] 11.2 Separar rutas `/` y `/home`, dejar la landing sin shell para visitantes y el Inicio autenticado bajo el shell.
- [x] 11.3 Corregir el filtro global de terceros para mostrar empresa a ancho completo antes de búsqueda y aplicar el identificador seleccionado a la consulta autorizada.
- [x] 11.4 Usar empresa en borrador al buscar terceros desde filtros de Invitaciones y Usuarios vinculados; permitir elegir el tipo Tercero y enviar filtros de pertenencia por tercero al servicio.
- [x] 11.5 Revisar documentación y diff; no ejecutar pruebas hasta que se soliciten.

## 12. Ajustes tras revisión del wireframe

- [x] 12.1 Actualizar primero el wireframe móvil para acciones de Parámetros con texto, distribución del filtro de Usuarios y selección de empresa durante carga.
- [x] 12.2 Restaurar una sesión Keycloak vigente al recargar directamente `/home`, conservando la ruta.
- [x] 12.3 Mantener seleccionables las empresas cargadas en el selector y confirmar que el filtro de Terceros envía `relatedCompanyId` y el backend lo aplica a relaciones.
- [x] 12.4 Distribuir el modal de Usuarios como indica el wireframe y usar botones de texto en sus tarjetas móviles de Parámetros.
- [x] 12.5 Revisar documentación y diff; no ejecutar pruebas hasta que se soliciten.

## 13. Observaciones de facturas y validación de cierre

- [x] 13.1 Mostrar la columna Vehículo inmediatamente después de Número en la tabla de escritorio y conservar el dato en las tarjetas móviles.
- [x] 13.2 Permitir editar facturas manuales cuando la política de vigencia válida y el permiso lo permitan; usar un mensaje claro cuando la política no se pueda confirmar.
- [x] 13.3 Completar validación final, corregir las regresiones encontradas y registrar evidencia antes de archivar.

### Registro de validación — 2026-11-23

- `frontend`: `npm test -- --run --reporter=dot --pool=threads --maxWorkers=3 --isolate=false` pasó con 220 pruebas en 36 archivos.
- `frontend`: `npm run typecheck` pasó; `npm run lint` terminó sin errores con 12 advertencias de React Hooks; `npm run test:architecture` pasó.
- `backend`: `npm run typecheck` y `npm run test:architecture` pasaron; `npm run lint` terminó sin errores con 8 advertencias; `npm test` pasó con 485 pruebas en 53 archivos. El backend no tuvo cambios desde esa ejecución.
- `openspec validate standardize-shared-module-components --json` pasó (1 cambio, sin incidencias).
- Revisión visual: shell largo en escritorio y drawer móvil; notificaciones a 360 px y 1280 px con estados de carga, error y vacío, tabla/tarjetas, filtros y detalle. La ruta de notificaciones requiere un rol no disponible en la sesión activa; se usó un harness local temporal que renderiza el componente real y luego se retiró.
- Revisión visual de facturas en escritorio: la columna Vehículo sigue a Número; el lápiz solo aparece en la factura manual `78787878` cuando su vigencia es válida. Las demás manuales fuera de vigencia y las de origen QR no ofrecen edición para el rol sujeto a esa política. Los administradores de terceros conservan la excepción autorizada por rol en backend.
- No quedan tareas pendientes en esta propuesta (52 de 52). El cambio está listo para archivar; resta decidir si se sincroniza el delta de `application-ui-design` a la especificación principal o se archiva sin sincronizar.
