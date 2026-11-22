# configuration Specification

## Purpose

Administrar parámetros funcionales tipados y versionados, y proporcionar políticas efectivas verificables para las operaciones de negocio sin acoplar sus consumidores al almacenamiento.

## Requirements

### Requirement: Catálogo cerrado y validación tipada

El sistema MUST soportar inicialmente invoice.manual-edit-window-seconds como entero de segundos entre 1 y 31536000, con valor inicial de 43200. Nombre, descripción, tipo, unidad, rango y ámbito global MUST pertenecer al catálogo controlado por código. La API MUST permitir modificar solo el valor con versión vigente y MUST rechazar claves arbitrarias y metadatos manipulados.

#### Scenario: Duración inicial aprobada
- **WHEN** se inicializa explícitamente el parámetro por primera vez
- **THEN** queda disponible con 43200 segundos, equivalente a 12 horas, y metadatos de servidor

#### Scenario: Valor inválido
- **WHEN** se envía cero, fracción, valor fuera del rango o un atributo no editable
- **THEN** responde 400 sin modificar el parámetro ni registrar éxito

### Requirement: Administración global autorizada

Solo APP_ADMIN en contexto global con parameters:read MUST consultar listado, detalle e historial; con parameters:update MUST actualizar valores. Los demás roles MUST NOT obtener acceso administrativo implícito. La API MUST NOT ofrecer alta, borrado ni desactivación de parámetros. Toda mutación MUST revalidar autoridad al confirmar.

#### Scenario: Actor sin acceso
- **WHEN** un actor sin rol, permiso o contexto global requerido solicita una operación administrativa
- **THEN** responde 403 antes de consultar la existencia del parámetro

### Requirement: Inicialización explícita e idempotente

Una operación administrativa técnica explícita MUST insertar únicamente claves conocidas ausentes, con valor inicial de catálogo y evento durable. MUST conservar valores existentes válidos y bloquearse ante datos incompatibles. Lecturas y operaciones de factura MUST NOT inicializar, reparar ni sobrescribir parámetros.

#### Scenario: Repetición de inicialización
- **WHEN** se repite el inicializador después de que un administrador modificó el valor
- **THEN** conserva valor, versión e historial sin generar otro evento de inicialización

### Requirement: Resolución efectiva por contrato interno

Configuration MUST exponer un contrato de política efectiva con duración, revisión, ámbito y vigencia. La política global MUST aplicarse a todos los terceros sin sobrescrituras organizacionales en este incremento. El consumo interno MUST NOT exigir parameters:read al usuario que opera una factura ni revelar el catálogo administrativo.

#### Scenario: Consumo por conductor
- **WHEN** Invoice Management evalúa una edición autorizada para un conductor sin parameters:read
- **THEN** obtiene internamente la política global efectiva y decide la elegibilidad sin conceder acceso administrativo

### Requirement: Edición manual con política vigente

La ventana MUST partir de createdAt con reloj de servidor y borde exclusivo. La política efectiva al editar MUST aplicarse también a facturas existentes, sin modificar sus fechas ni copiar duración a cada factura. La política MUST NOT habilitar edición de facturas QR protegidas ni ampliar permisos.

#### Scenario: Límite de doce horas
- **WHEN** una factura se evalúa exactamente doce horas después de createdAt con duración vigente de 43200 segundos
- **THEN** la ventana está cerrada; antes del límite está abierta si cumple las otras reglas

#### Scenario: Cambio de duración
- **WHEN** cambia la duración y se evalúa después una factura creada previamente
- **THEN** se utiliza el nuevo valor vigente y la factura conserva createdAt e historial

### Requirement: Confirmación resistente a concurrencia

Actualizar un parámetro MUST exigir versión vigente; una revisión obsoleta MUST producir 409. La edición dependiente de factura MUST confirmar la revisión y vigencia dentro de su transición atómica y MUST NOT usar evidencia invalidada por un cambio concurrente. El plazo MUST volver a comprobarse en el instante de confirmación.

#### Scenario: Cambio durante edición de factura
- **WHEN** el valor cambia después de leerlo y antes de confirmar una edición de factura
- **THEN** esa edición no se confirma con la revisión anterior y puede reintentarse con política actual

#### Scenario: Plazo vence durante procesamiento
- **WHEN** la ventana estaba abierta al iniciar y se alcanza su límite antes de confirmar
- **THEN** no se confirma una edición fuera de plazo

### Requirement: Configuración ausente sin respaldo implícito

Si falta el parámetro, no está vigente, es inválido o no puede leerse o confirmarse, el consumidor MUST rechazar la operación dependiente con 503 y mantener consulta y alta de facturas disponibles. El valor inicial de catálogo MUST NOT actuar como respaldo de ejecución.

#### Scenario: Parámetro sin inicializar
- **WHEN** se intenta editar una factura y no existe política efectiva persistida
- **THEN** responde EDIT_POLICY_UNAVAILABLE sin insertar valores ni modificar la factura

### Requirement: Auditoría y cambios sin efecto

Cada cambio efectivo MUST persistir parámetro y evento durable en una sola transición con actor, instante, correlación, valor anterior/nuevo y versiones. Un fallo MUST impedir confirmación parcial. Repetir el valor vigente con versión actual MUST conservar versión y no duplicar eventos. Los eventos MUST excluir secretos y datos de facturas.

#### Scenario: Auditoría fallida
- **WHEN** falla la captura durable del evento durante una actualización
- **THEN** se conserva el valor anterior y no se informa éxito

### Requirement: REST e interfaz verificables

El sistema MUST documentar listado, detalle, historial y actualización en OpenAPI 3.1 con Bearer, contexto global explícito y errores normalizados. La UI MUST reutilizar estilos y componentes compartidos, mostrar unidad y efecto retroactivo antes de confirmar, manejar conflictos y funcionar con teclado a 360 y 1280 px.

#### Scenario: Confirmación de actualización
- **WHEN** el administrador cambia la ventana desde la interfaz
- **THEN** revisa el valor anterior, nuevo, unidad y efecto sobre facturas existentes antes de confirmar

#### Scenario: Pérdida de autorización o contexto
- **WHEN** se pierde el contexto global o permiso durante una petición
- **THEN** la UI limpia datos y borradores administrativos y descarta respuestas obsoletas

### Requirement: El catálogo expone el valor inicial validado

La respuesta administrativa del catálogo MUST incluir `initialValue` como entero del catálogo inmutable. El cliente MUST validar ese campo junto con el resto del contrato y MUST tratar su ausencia o formato inválido como respuesta no válida.

#### Scenario: Catálogo con valor inicial
- **WHEN** el cliente recibe un registro de parámetro válido
- **THEN** acepta el valor inicial entero junto con el valor vigente y sus metadatos

#### Scenario: Respuesta sin valor inicial
- **WHEN** el cliente recibe un registro sin `initialValue` o con un valor no entero
- **THEN** rechaza la respuesta y muestra el estado de error de consulta

### Requirement: El refresco silencioso de permisos no repite consultas sin cambios

La interfaz MUST conservar el catálogo cargado cuando el refresco de permisos mantiene el mismo contexto global y los mismos permisos efectivos. MUST limpiar los datos administrativos si se revoca el permiso de lectura o se pierde el contexto global.

#### Scenario: Permisos efectivos sin cambios
- **WHEN** se actualizan las credenciales y el permiso `parameters:read` continúa vigente en contexto global
- **THEN** la interfaz mantiene el catálogo y no inicia otra consulta de listado

#### Scenario: Permiso o contexto revocado
- **WHEN** el refresco elimina `parameters:read` o deja el contexto global
- **THEN** la interfaz cancela solicitudes pendientes y limpia catálogo, historial y borrador
