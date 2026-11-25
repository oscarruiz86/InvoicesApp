# Spec Delta

## Purpose

Permite a los conductores capturar facturas sin cobertura, sincronizarlas posteriormente y conocer el resultado, mientras reserva la resolución de conflictos al administrador autorizado del tercero.

## ADDED Requirements

### Requirement: Credencial offline limitada y firmada por el servidor
El servidor MUST emitir una credencial offline solo después de autenticar en línea a un DRIVER y validar su tercero y asignaciones. MUST firmarla asimétricamente y limitarla al alcance `invoice:offline-capture`, sujeto, tercero y asignaciones. Su vigencia MUST ser como máximo 8 horas. El cliente MUST verificar firma, emisor, expiración y contexto antes de habilitar captura.

#### Scenario: Emisión después de autenticación
- **WHEN** un DRIVER autenticado en línea solicita habilitar captura offline
- **THEN** el servidor emite una credencial firmada y acotada a su sujeto, tercero y asignaciones vigentes, con expiración no mayor a 8 horas

#### Scenario: Verificación local válida
- **WHEN** el conductor abre la aplicación sin conexión con una credencial válida y contexto coincidente
- **THEN** el cliente verifica la firma localmente y habilita solo captura local para las asignaciones incluidas

#### Scenario: Credencial expirada o alterada
- **WHEN** el cliente detecta que la credencial expiró, su firma no es válida o su contexto no coincide
- **THEN** bloquea nuevas capturas offline e informa que se requiere conexión para reautenticarse

#### Scenario: Sincronización con credencial offline
- **WHEN** el conductor intenta usar la credencial offline como autorización de una solicitud al backend
- **THEN** el servidor la rechaza y exige autenticación normal; el registro local se conserva para reintentar tras reautenticación

### Requirement: La credencial offline no autoriza operaciones de API
La credencial offline MUST NOT autorizar llamadas al backend. La sincronización y consulta requieren autenticación normal en línea. Al vencer el ticket, el cliente MUST impedir nuevas capturas, conservar la cola y permitir su envío tras reautenticación del mismo sujeto y tercero.

#### Scenario: Sincronización tras vencer la credencial
- **WHEN** una credencial offline expira mientras existen capturas pendientes
- **THEN** la aplicación conserva la cola, solicita conexión y reautenticación, y luego sincroniza con la sesión normal del mismo sujeto y tercero

### Requirement: Disponibilidad offline de captura de factura
La aplicación MUST permitir abrir la experiencia de captura MANUAL y QR sin red después de haber cargado su aplicación, sesión y contexto del conductor con conexión. MUST conservar localmente las asignaciones disponibles en el último contexto válido y no permitir iniciar una sesión nueva sin conexión.

#### Scenario: Aplicación previamente preparada sin red
- **WHEN** un DRIVER con sesión y contexto previamente validados abre la aplicación sin conexión
- **THEN** puede abrir la captura manual o QR y seleccionar solo asignaciones conservadas de ese contexto

#### Scenario: Se pierde la conexión con la aplicación abierta
- **WHEN** el navegador detecta que se perdió la conexión mientras el DRIVER usa la aplicación
- **THEN** la aplicación muestra la captura offline con la credencial y asignaciones previamente verificadas, conserva la cola local y no presenta un fallo de permisos o una sesión expirada solo por falta de red

#### Scenario: Se recupera la conexión después de la captura offline
- **WHEN** el navegador detecta que regresó la conexión
- **THEN** la aplicación vuelve a cargar la experiencia autenticada y sus permisos para sincronizar los registros pendientes

#### Scenario: Sin datos previos de contexto
- **WHEN** un DRIVER abre la aplicación sin conexión sin una credencial válida o asignaciones previamente disponibles
- **THEN** la aplicación informa que requiere conexión antes de iniciar una captura

#### Scenario: Aviso de preparación según rol
- **WHEN** un usuario que no tiene rol DRIVER consulta Facturas
- **THEN** no ve avisos de preparación offline ni secciones de cola o historial de captura del conductor

### Requirement: Sincronización idempotente y estados de envío
La aplicación MUST enviar registros pendientes al recuperar conexión usando una identidad estable por registro y MUST conservarlos localmente hasta recibir un resultado definitivo. Los reintentos MUST NOT crear facturas duplicadas. Un registro MUST transitar solo entre `PENDING`, `SENDING`, `RETRYABLE_FAILURE`, `REQUIRES_CORRECTION`, `CONFLICT`, `SYNCHRONIZED`, `LINKED` o `REJECTED`.

#### Scenario: Sincronización después de recuperar conexión
- **WHEN** la aplicación detecta conexión y existen facturas pendientes
- **THEN** intenta enviarlas y muestra el estado de envío correspondiente

#### Scenario: Reintento tras respuesta incierta
- **WHEN** se pierde la conexión antes de conocer el resultado de un envío
- **THEN** la aplicación reintenta con la misma identidad y el servidor devuelve el resultado original sin duplicar la factura

#### Scenario: Confirmación del servidor
- **WHEN** el servidor confirma la creación de la factura
- **THEN** la aplicación marca el registro como sincronizado y registra la confirmación recibida

#### Scenario: Error temporal
- **WHEN** el servidor no está disponible o el envío falla por una causa temporal
- **THEN** el registro permanece pendiente de reintento y el conductor puede ver el error

#### Scenario: Resultado terminal
- **WHEN** un envío queda sincronizado, vinculado o rechazado
- **THEN** no vuelve a enviarse automáticamente ni permite cambiar su resultado local

### Requirement: Clasificación de resultados de sincronización
El servidor MUST clasificar indisponibilidad y respuesta incierta como reintentables; campos, imagen o QR inválido, incompleto o no soportado como `REQUIRES_CORRECTION`; pérdida de autorización o tercero inactivo como rechazo; y solo duplicidad comercial o asignación cerrada como conflicto administrativo. Un envío con varias causas MUST conservar todas las causas vigentes.

#### Scenario: Datos corregibles
- **WHEN** el servidor rechaza un campo, imagen o contenido QR que el conductor puede corregir
- **THEN** marca el envío como `REQUIRES_CORRECTION` y permite crear una nueva presentación con una identidad idempotente distinta

#### Scenario: Duplicidad y asignación cerrada simultáneas
- **WHEN** un envío tiene duplicidad comercial y asignación cerrada
- **THEN** conserva ambas causas en el mismo conflicto y exige una resolución compatible con todas las causas vigentes

### Requirement: Conflicto de sincronización visible
El servidor MUST identificar los envíos que no puede aceptar automáticamente por conflicto de negocio y MUST conservarlos en un estado revisable, sin convertirlos en facturas confirmadas ni descartar la información presentada.

#### Scenario: Factura duplicada en el servidor
- **WHEN** una factura sincronizada colisiona con una factura existente del mismo tercero según la clave de negocio
- **THEN** el servidor marca el envío como conflicto revisable y no crea una segunda factura

#### Scenario: Asignación ya no elegible
- **WHEN** una factura sincronizada referencia una asignación que dejó de ser elegible antes de su confirmación
- **THEN** el servidor registra el conflicto para revisión y no cambia la asignación ni confirma automáticamente la factura

### Requirement: Adjuntos temporales de envíos no resueltos
El servidor MUST conservar la imagen normalizada, si el envío la incluye, en almacenamiento temporal mientras el envío sea corregible o esté en conflicto. MUST eliminar el adjunto temporal al resultado terminal o al vencer 30 días desde que el envío entra en corrección o conflicto. Un worker MUST reintentar borrados fallidos y MUST rechazar envíos corregibles o conflictos vencidos.

#### Scenario: Imagen disponible durante revisión
- **WHEN** un envío con imagen válida entra en conflicto
- **THEN** el administrador autorizado puede revisar la imagen temporal sin exponer su ubicación física

#### Scenario: Conflicto vencido
- **WHEN** transcurren 30 días desde que se creó un conflicto sin resolución
- **THEN** el sistema lo marca rechazado y elimina su imagen temporal

#### Scenario: Corrección vencida
- **WHEN** transcurren 30 días desde que un envío entra en corrección requerida sin nueva presentación
- **THEN** el sistema lo marca rechazado y elimina su imagen temporal

### Requirement: Resolución de conflictos por administrador tercero
Solo un THIRD_PARTY_ADMIN con permiso vigente sobre el tercero del registro MUST poder resolver un conflicto. Cada decisión MUST ser explícita, versionada y auditable; el DRIVER propietario MUST poder consultar el estado y resultado sin poder resolverlo. Una decisión de excepción MUST basarse en la factura, su imagen, el intervalo histórico de la asignación y un motivo del administrador; la hora del dispositivo no prueba por sí sola la captura.

#### Scenario: Administrador vincula duplicado
- **WHEN** un THIRD_PARTY_ADMIN autorizado confirma que un conflicto corresponde a una factura ya existente
- **THEN** puede vincular la captura offline a la factura existente o rechazarla, registra el motivo y deja una sola factura comercial

#### Scenario: Administrador aprueba asignación vencida excepcionalmente
- **WHEN** un THIRD_PARTY_ADMIN autorizado revisa la factura, imagen e historial de una asignación cerrada y aprueba una excepción con motivo
- **THEN** el sistema registra la factura conservando la asignación histórica, la decisión excepcional, su motivo, actor y fecha en auditoría

#### Scenario: Administrador rechaza conflicto de asignación
- **WHEN** un THIRD_PARTY_ADMIN autorizado determina que no procede aceptar una captura con asignación vencida
- **THEN** rechaza el envío con un motivo visible para el conductor y no crea una factura

#### Scenario: Conductor intenta resolver conflicto
- **WHEN** el DRIVER propietario solicita aceptar, asociar o rechazar el conflicto
- **THEN** el sistema deniega la operación y conserva el conflicto sin cambios

#### Scenario: Administrador de otro tercero
- **WHEN** un THIRD_PARTY_ADMIN intenta consultar o resolver un conflicto de un tercero no autorizado
- **THEN** el sistema deniega el acceso sin revelar los datos del registro

#### Scenario: Decisión concurrente
- **WHEN** un administrador resuelve un conflicto usando una versión que ya cambió
- **THEN** el sistema devuelve conflicto de versión y conserva la decisión vigente

### Requirement: Protección de la cola local
La aplicación MUST aislar cada captura local por sujeto y tercero. Al cerrar sesión, expirar la sesión o cambiar de sujeto, MUST impedir mostrar o sincronizar las capturas del sujeto anterior y eliminar sus imágenes y registros locales pendientes después de advertir que no están respaldados en el servidor.

#### Scenario: Cierre de sesión con capturas pendientes
- **WHEN** un DRIVER cierra sesión con facturas sin resultado de servidor
- **THEN** la aplicación advierte que se eliminarán del dispositivo y, tras confirmar el cierre, elimina sus datos locales

### Requirement: Historial paginado de sincronización para conductor y administrador tercero
El servidor MUST ofrecer al DRIVER un historial paginado de sus envíos del tercero activo, aislado por sujeto y tercero. El THIRD_PARTY_ADMIN autorizado MUST poder consultar los envíos del tercero activo. MUST incluir estados pendientes y terminales recibidos por el servidor, con un resumen para reconocer la factura. Si hubo resolución, MUST incluir acción, fecha, motivo y resultado asociado. MUST NOT incluir imágenes, QR completo ni identidad del administrador.

#### Scenario: Conductor consulta su historial
- **WHEN** un DRIVER consulta el historial de sincronización de su tercero
- **THEN** recibe únicamente sus envíos, paginados y ordenados, incluidos los rechazados y resueltos

#### Scenario: Consulta de otro conductor o tercero
- **WHEN** un DRIVER altera el tercero, sujeto, página o identificador para consultar envíos ajenos
- **THEN** el servidor limita la consulta a su identidad autorizada o la deniega sin revelar registros ajenos

#### Scenario: Conflicto resuelto por administrador
- **WHEN** un THIRD_PARTY_ADMIN resuelve un conflicto del conductor
- **THEN** el historial del conductor muestra el estado final, la acción administrativa, su fecha y motivo, y la factura resultante cuando exista

#### Scenario: Administrador consulta historial del tercero
- **WHEN** un THIRD_PARTY_ADMIN con permiso de lectura consulta el historial desde la página de facturas
- **THEN** recibe el historial paginado de envíos de su tercero activo y no recibe registros de otros terceros ni el sujeto interno del conductor

#### Scenario: Error recuperable del historial
- **WHEN** falla la conexión o el servicio al consultar el historial
- **THEN** la página explica que el historial no pudo cargarse y ofrece reintentar sin ocultar el motivo operativo general

### Requirement: Separación entre cola de trabajo e historial
La cola local de sincronización MUST mostrar solo capturas que requieren envío, reintento, corrección o revisión. Un registro `SYNCHRONIZED`, `LINKED` o `REJECTED` MUST dejar de aparecer en esa cola al recibir el resultado definitivo y MUST permanecer consultable en el historial del servidor si este recibió el envío. Las capturas rechazadas localmente sin recibo del servidor MUST identificarse como historial local, no como pendientes.

#### Scenario: Envío rechazado
- **WHEN** el servidor devuelve un rechazo definitivo para una factura offline
- **THEN** la factura desaparece de la cola pendiente y aparece como rechazada en el historial, con el motivo disponible

#### Scenario: Envío sincronizado o vinculado
- **WHEN** el servidor confirma, vincula o resuelve el envío
- **THEN** la factura desaparece de la cola pendiente y el historial conserva el estado y la referencia resultante

#### Scenario: Rechazo local sin registro del servidor
- **WHEN** una captura es rechazada antes de que el servidor cree un envío
- **THEN** se retira de la cola de sincronización y, si se conserva localmente, aparece solo en el historial de este dispositivo

### Requirement: Bandeja administrativa de conflictos contextual
La interfaz MUST mostrar el acceso a la bandeja administrativa solo cuando el actor tenga permisos de `THIRD_PARTY_ADMIN` para facturas y existan conflictos pendientes para el tercero activo. El contenido de revisión MUST abrirse en un modal paginado que preserve la comparación y las acciones de resolución autorizadas.

#### Scenario: No hay facturas por revisar
- **WHEN** el administrador carga facturas y el servidor devuelve cero conflictos
- **THEN** la pantalla no muestra una bandeja vacía ni un contador de conflictos en cero

#### Scenario: Hay facturas por revisar
- **WHEN** el servidor devuelve uno o más conflictos vigentes
- **THEN** la pantalla muestra un acceso con la cantidad y permite revisar el listado paginado en un modal

### Requirement: Validación precisa de hora y campos de factura
Los formularios MUST enviar la hora en formato `HH:mm:ss`, normalizando la entrada `HH:mm`. Las validaciones MUST preservar `INVALID_REQUEST`, identificar campos permitidos y describir el campo con un mensaje seguro sin reflejar valores enviados ni errores internos. Los mensajes MUST distinguir datos manuales de QR.

#### Scenario: Captura manual con hora válida
- **WHEN** el conductor guarda una hora `HH:mm` en alta o edición
- **THEN** el cliente envía la misma hora con segundos `:00`

#### Scenario: Hora inválida en API
- **WHEN** una petición manual contiene una hora distinta a `HH:mm:ss`
- **THEN** responde `INVALID_REQUEST`, el campo `invoiceTime` y un mensaje que indica el formato requerido

#### Scenario: QR inválido en envío offline
- **WHEN** la validación del envío QR falla por su contenido
- **THEN** el error identifica `qrContent` y usa un mensaje de QR, sin etiquetar la operación como factura manual

### Requirement: Vista compacta de facturas del conductor
La vista del DRIVER MUST separar facturas registradas, pendientes e historial en pestañas, ocultar Pendientes si no hay registros, diferir la carga del historial y mostrar el detalle pendiente en un modal sin identificadores internos. La cola MUST usar tarjetas en móvil y tabla paginada en pantallas amplias, conservando estados críticos y acciones.

#### Scenario: Cola vacía
- **WHEN** el DRIVER no tiene registros que requieran trabajo
- **THEN** la pantalla no muestra la pestaña Pendientes

#### Scenario: Consulta de pendientes
- **WHEN** el DRIVER abre Pendientes y selecciona el detalle de un registro
- **THEN** ve el resumen de factura y el estado en un modal con sus acciones de corregir, reintentar o consultar conflicto

#### Scenario: Historial bajo demanda
- **WHEN** el DRIVER abre Facturas sin seleccionar Historial
- **THEN** la aplicación no solicita el historial al servidor hasta que se seleccione esa pestaña

#### Scenario: Avisos offline por rol
- **WHEN** un usuario sin rol DRIVER consulta facturas
- **THEN** no ve avisos de preparación offline ni navegación de captura local

### Requirement: Formulario offline de captura QR
La captura offline MUST ofrecer los modos Manual y Código QR en dos pestañas. Tras leer un QR, MUST mostrar los datos interpretados en campos legibles y mantener oculto el contenido original. Las etiquetas de fecha y hora MUST evitar superponerse con sus controles.

#### Scenario: Captura offline con dos modos
- **WHEN** el DRIVER abre captura offline o lee un QR
- **THEN** ve las pestañas Manual y Código QR y los datos interpretados del QR en campos legibles, sin un control que revele el contenido QR original

### Requirement: Separadores de miles en importes offline
Los campos numéricos de captura offline MUST agrupar miles para facilitar la lectura y MUST normalizar el valor al guardarlo en la cola local.

#### Scenario: Valores de captura manual
- **WHEN** el DRIVER escribe un importe de cuatro o más dígitos
- **THEN** ve separadores de miles en el campo y el dispositivo conserva el valor numérico normalizado para sincronizar

### Requirement: Acceso administrativo y presentación de facturas
La página MUST ofrecer a THIRD_PARTY_ADMIN con permiso `invoices:read` una acción de barra para abrir el historial del tercero activo bajo demanda y volver a facturas. La acción Capturar factura del DRIVER MUST aparecer en esa barra antes del filtro.

#### Scenario: Acceso al historial de administrador tercero
- **WHEN** un THIRD_PARTY_ADMIN abre Facturas
- **THEN** puede abrir Consultar historial desde la barra y consultar páginas sin que se solicite hasta que use la acción

#### Scenario: Captura desde la barra de herramientas
- **WHEN** un DRIVER abre la lista de facturas
- **THEN** encuentra Capturar factura en la barra, antes del filtro, y no ve una acción duplicada fuera de ella

### Requirement: Presentación consistente de tablas
Las tablas reutilizadas por la aplicación MUST permitir desplazamiento horizontal sin recortar columnas, mantener encabezados claros y facilitar la lectura de filas.

#### Scenario: Tabla más ancha que el móvil
- **WHEN** una tabla contiene más columnas que el ancho disponible
- **THEN** el usuario puede desplazarse horizontalmente y consultar todas sus columnas

### Requirement: Mensajes específicos de corrección offline
Los mensajes de corrección offline MUST nombrar los campos o la imagen que se deben corregir mediante etiquetas seguras; los errores QR MUST indicar una acción apropiada para corregir la lectura.

#### Scenario: Corrección de campos o QR
- **WHEN** el servidor rechaza un campo, una imagen o un QR corregible
- **THEN** el conductor recibe una indicación concreta, sin errores internos ni valores privados del QR

### Requirement: Cola offline en pestaña independiente
La captura y la cola de sincronización offline MUST presentarse en pestañas separadas. La pestaña de pendientes MUST mostrar el total de registros que requieren envío, corrección o revisión, MUST abrir el listado paginado al seleccionarla y MUST ocultarse cuando la cola esté vacía.

#### Scenario: Conductor consulta pendientes offline
- **WHEN** un DRIVER abre la captura offline mientras existen registros que requieren acción
- **THEN** ve una pestaña `Pendientes (n)` separada de la captura y consulta la tabla o tarjetas al seleccionarla

#### Scenario: Cola offline vacía
- **WHEN** el dispositivo no tiene registros que requieran envío, corrección o revisión
- **THEN** la interfaz no muestra una pestaña de pendientes vacía y mantiene disponible la captura

### Requirement: Datos legibles de asignación en historial administrativo
El historial consultado por un `THIRD_PARTY_ADMIN` MUST mostrar el nombre del conductor y la placa del vehículo asociados a cada envío. MUST obtenerlos de la asignación y vehículo del tercero activo y MUST NOT exponer el sujeto interno ni identificadores internos del conductor.

#### Scenario: Administrador identifica conductor y vehículo
- **WHEN** un THIRD_PARTY_ADMIN autorizado consulta el historial paginado de su tercero
- **THEN** cada envío muestra el nombre del conductor y la placa asociada a su asignación en escritorio y móvil, sin incluir el sujeto interno del conductor
