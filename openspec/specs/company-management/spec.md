# company-management Specification

## Purpose

Administrar el ciclo de vida de empresas y sus administradores con identificación tributaria única, aislamiento organizacional y trazabilidad durable de cada cambio administrativo.

## Requirements

### Requirement: Registro de empresa con metadatos confiables
El sistema MUST crear empresas con documentType NIT o CC, documentNumber, businessName y email obligatorios. MUST generar identidad, fechas, actor y estado ACTIVE en el servidor. NIT MUST exigir un dígito de verificación; CC MUST NOT admitirlo. tradeName, phone, address y ubicación son opcionales. Los administradores no se embeben en Company.

#### Scenario: Registro válido
- **WHEN** APP_ADMIN con companies:create global registra NIT con dígito de verificación o CC sin dígito, razón social y correo válidos
- **THEN** recibe 201 con id ObjectId serializado, estado ACTIVE, fechas UTC de servidor y createdBy igual al sujeto autenticado
- **AND** updatedBy permanece null hasta una modificación y la empresa tiene representación organizacional compatible

#### Scenario: Dígito según tipo documental
- **WHEN** se registra NIT sin dígito de verificación o CC con un dígito
- **THEN** se rechaza la solicitud indicando el campo inválido

#### Scenario: Campos opcionales
- **WHEN** se registra una empresa con nombre comercial, teléfono, dirección o ubicación opcionales válidos o se omiten
- **THEN** se conservan sus valores o se devuelven null sin inventar información

#### Scenario: Referencias de catálogo
- **WHEN** se registra una empresa con ubicación o tipo documental
- **THEN** el backend valida códigos existentes y relaciones geográficas padre-hijo y devuelve código y etiqueta legible

### Requirement: Validación y normalización de datos
El sistema MUST rechazar campos obligatorios ausentes/vacíos, formatos inválidos y propiedades no admitidas. MUST recortar textos, normalizar email a minúsculas y exigir documentNumber de 1–20 dígitos sin separadores, conservando ceros iniciales. Para NIT MUST requerir verificationDigit de un dígito; para CC MUST rechazarlo. No debe calcularlo automáticamente.

#### Scenario: Entradas inválidas
- **WHEN** falta businessName, email o documentNumber, el correo es inválido, el documento contiene letras/separadores o el dígito no cumple la regla de su tipo
- **THEN** devuelve 400 INVALID_REQUEST con errores de campos seguros y no persiste empresa ni evento de éxito

#### Scenario: Metadatos manipulados
- **WHEN** un cuerpo de alta o cambios de perfil incluye id, status, createdAt, updatedAt, createdBy, updatedBy, administradores, roles o permisos
- **THEN** rechaza la solicitud con 400 sin aceptar identidad ni metadatos del cliente

#### Scenario: Correo normalizado
- **WHEN** se registra o edita usando email con espacios exteriores y mayúsculas
- **THEN** el valor almacenado y devuelto queda recortado y en minúsculas

#### Scenario: Documento según tipo
- **WHEN** se envía CC con verificationDigit o NIT sin un dígito verificador válido
- **THEN** se rechaza con error del campo correspondiente sin persistir empresa

### Requirement: Unicidad tributaria conservada
El sistema MUST garantizar unicidad de la pareja documentType/documentNumber, incluso con solicitudes concurrentes y empresas inactivas. MUST permitir corrección autorizada de identificación solo si la nueva pareja está libre. MUST NOT imponer unicidad de email o razón social.

#### Scenario: Identificación duplicada
- **WHEN** se registra o edita con la identificación de otra empresa activa o inactiva
- **THEN** devuelve 409 COMPANY_DOCUMENT_CONFLICT sin revelar datos de la empresa existente

#### Scenario: Altas concurrentes
- **WHEN** dos registros intentan confirmar simultáneamente la misma identificación
- **THEN** solo uno crea la empresa y el otro recibe conflicto, sin organizaciones ni eventos huérfanos

### Requirement: Autorización administrativa explícita
El sistema MUST exigir JWT válido, scope explícito y permisos vigentes en cada operación. APP_ADMIN MUST operar globalmente según sus grants; COMPANY_ADMIN MUST limitar consulta/edición a la empresa activa de su contexto autorizado. THIRD_PARTY_ADMIN y DRIVER sin otro grant aplicable MUST NOT administrar empresas. Omitir scope MUST NOT conceder acceso global.

#### Scenario: Creación restringida
- **WHEN** COMPANY_ADMIN, THIRD_PARTY_ADMIN o DRIVER intenta crear una empresa
- **THEN** recibe 403 y no se crea ningún registro aunque declare scope global

#### Scenario: Global sin asociación
- **WHEN** APP_ADMIN con companies:read consulta scope global sin asociaciones locales
- **THEN** puede consultar empresas activas/inactivas sin obtener acceso operativo a flota o facturas

#### Scenario: Contexto omitido o incompatible
- **WHEN** una operación omite scope o combina el módulo de empresas con thirdPartyId
- **THEN** recibe 400 INVALID_REQUEST sin selección implícita

#### Scenario: Roles combinados
- **WHEN** un usuario COMPANY_ADMIN en A y DRIVER en B intenta editar B
- **THEN** no combina el rol de A con su asociación a B para autorizar la modificación

### Requirement: Consultas paginadas y aisladas
El sistema MUST ofrecer listado con búsqueda literal por prefijo en documentNumber, businessName o tradeName, filtros status/documentType/country/department/city, ordenamiento permitido y paginación. MUST aplicar pertenencia antes de filtros, conteo y paginación, y usar orden estable. El listado organizacional MUST limitarse a la empresa seleccionada.

#### Scenario: Consulta filtrada
- **WHEN** un actor autorizado consulta page=2, pageSize=10, q y filtros válidos
- **THEN** recibe items, page, pageSize y total del conjunto autorizado filtrado, ordenado por el criterio solicitado y desempate por id

#### Scenario: Empresa ajena no contada
- **WHEN** COMPANY_ADMIN de A busca nombres o documentos de B
- **THEN** B no aparece ni afecta total, aunque exista o coincida con los filtros

#### Scenario: Límites y orden
- **WHEN** se solicita page menor que 1, pageSize mayor que 100, sort no permitido o parámetros duplicados/desconocidos
- **THEN** recibe 400; una página válida posterior al final devuelve items vacío y conserva total correcto

#### Scenario: Filtro geográfico por código
- **WHEN** el listado se filtra por códigos de país, departamento o municipio
- **THEN** solo devuelve empresas con referencias coincidentes y no interpreta etiquetas como identificadores

### Requirement: Detalle y edición con control de versión
El sistema MUST ofrecer detalle y edición de datos admitidos con companies:read y companies:update respectivamente. MUST ocultar IDs ajenos/inexistentes con 404 después de validar permiso/contexto. MUST exigir versión de recurso en modificaciones, conservar createdAt/createdBy y actualizar updatedAt/updatedBy desde servidor únicamente al cambiar datos.

#### Scenario: Edición autorizada
- **WHEN** COMPANY_ADMIN autorizado edita A con versión vigente
- **THEN** persiste los campos válidos, incrementa versión y mantiene su identidad organizacional
- **AND** si cambia businessName, el selector obtiene el nombre actualizado

#### Scenario: ID ajeno
- **WHEN** un usuario con permiso y contexto A válidos consulta o modifica por ID la empresa B
- **THEN** recibe 404 RESOURCE_NOT_FOUND sin divulgar ni modificar B

#### Scenario: Edición perdida evitada
- **WHEN** se modifica con una versión obsoleta
- **THEN** devuelve 409 COMPANY_VERSION_CONFLICT sin sobrescribir datos y exige recarga antes de reintentar

### Requirement: Activación y desactivación sin borrado
Solo APP_ADMIN global con companies:deactivate MUST cambiar ACTIVE/INACTIVE mediante operación dedicada. MUST conservar datos, asociaciones, relaciones e historial; MUST NOT ofrecer eliminación física. Reactivar MUST preservar revocaciones explícitas de asociaciones y no crear privilegios nuevos.

#### Scenario: Desactivación con dependencias
- **WHEN** se desactiva una empresa con asociaciones y referencias relacionadas
- **THEN** empresa y representación organizacional quedan inactivas atómicamente sin borrar ni reasignar dependencias

#### Scenario: Reactivación
- **WHEN** APP_ADMIN reactiva una empresa
- **THEN** las asociaciones conservadas activas vuelven a ser elegibles con permisos/roles vigentes; las revocadas permanecen inactivas
- **AND** no se modifica el estado de terceros, vehículos, facturas ni relaciones

#### Scenario: Estado repetido o cambio local no autorizado
- **WHEN** APP_ADMIN solicita el estado actual con versión vigente
- **THEN** recibe la representación vigente sin nueva mutación ni evento de transición
- **AND** COMPANY_ADMIN recibe 403 al intentar cualquier transición de estado

### Requirement: Invalidación del acceso organizacional
Una empresa INACTIVE MUST desaparecer de contextos operativos y su resolución MUST rechazarse. Nuevas operaciones MUST validar su estado vigente; la administración global MUST seguir disponible para consultar, corregir y reactivar. Desactivar una empresa MUST NOT bloquear contextos independientes de terceros activos.

#### Scenario: Contexto previamente seleccionado
- **WHEN** se confirma la desactivación de A y un usuario intenta resolver o usar su contexto anterior
- **THEN** recibe rechazo y la UI limpia datos/contexto al observarlo, conforme al ciclo existente de revalidación de hasta 30 segundos

#### Scenario: Tercero independiente
- **WHEN** A se desactiva y T sigue activo con asociación directa válida
- **THEN** el contexto que requiere A se rechaza y el contexto independiente de T conserva su evaluación normal

### Requirement: Consulta y gestión de administradores existentes
El sistema MUST reutilizar asociaciones organizacionales COMPANY_ADMIN. APP_ADMIN global con companies:read y associations:read MUST consultar administradores; para asociar MUST exigir users:associate y associations:manage, y para desasociar associations:manage. COMPANY_ADMIN MUST NOT gestionar ni listar administradores de empresa mediante estos endpoints, pues su delegación existente se limita a terceros.

#### Scenario: Incorporación por invitación
- **WHEN** APP_ADMIN autorizado invita a una empresa activa mediante el flujo de `implement-user-invitations`
- **THEN** crea una invitación pendiente sin acceso; solo la aceptación explícita de la identidad destinataria verificada crea la pertenencia y el rol local COMPANY_ADMIN

#### Scenario: Destinatario inválido o autoasociación
- **WHEN** se intenta usar el escritor antiguo por subject, aceptar con identidad deshabilitada o conceder privilegios al propio actor
- **THEN** rechaza sin asociación; no exige COMPANY_ADMIN en el token del destinatario ni expone perfiles ajenos

#### Scenario: Asociación repetida y desasociación
- **WHEN** se guarda sin cambios una pertenencia existente con revisión vigente o se suspende una ya inactiva
- **THEN** no duplica la asociación ni inventa otra transición
- **AND** una revocación real conserva el registro inactivo e invalida el acceso en la siguiente decisión

#### Scenario: Empresa sin administradores
- **WHEN** APP_ADMIN intenta retirar al último administrador de una empresa operativa
- **THEN** rechaza incluso ante revocaciones concurrentes
- **AND** una empresa recién creada sin administrador admite incorporación por invitación y no asocia automáticamente al creador

#### Scenario: Empresa inactiva y proveedor caído
- **WHEN** se intenta crear/reactivar una asociación en empresa inactiva
- **THEN** devuelve 409 COMPANY_INACTIVE; consultar o revocar asociaciones sigue permitido globalmente
- **AND** si no se puede verificar la identidad al aceptar en Keycloak, devuelve 503 sin asociarla

### Requirement: Confirmación consistente de escrituras y permisos
El sistema MUST serializar comprobación de política, contexto y versión con cada escritura administrativa. MUST confirmar juntos empresa, representación organizacional, asociación cuando aplique y captura de auditoría. MUST rechazar confirmación parcial o autorizaciones obsoletas; una lectura previa o snapshot del navegador MUST NOT bastar.

#### Scenario: Revocación concurrente
- **WHEN** se confirma una revocación de permiso/asociación o desactivación antes que una edición pendiente basada en evidencia anterior
- **THEN** la edición no confirma usando esa evidencia y no cambia datos ni captura éxito

#### Scenario: Fallo de confirmación
- **WHEN** falla escritura de organización, asociación o auditoría dentro de una operación
- **THEN** ningún cambio parcial queda visible y se devuelve error sin afirmar éxito

### Requirement: Auditoría administrativa durable
El sistema MUST capturar sin muestreo altas, ediciones, transiciones y asociación/revocación con eventId, actor verificado, instante, acción, resultado, correlación, recurso, contexto y cambios mínimos. MUST conservar historial y registrar denegaciones mediante el mecanismo limitado existente, sin tokens ni payloads arbitrarios.

#### Scenario: Historial de modificaciones
- **WHEN** se crea, edita, desactiva o reactiva una empresa o cambia un administrador
- **THEN** cada transición confirmada tiene un evento durable distinto con valores anteriores/posteriores permitidos y versiones, sin sobrescribir los previos

#### Scenario: Captura repetida o fallida
- **WHEN** se reintenta internamente la captura del mismo eventId
- **THEN** no se duplica el evento; si no puede persistirse, no se confirma la modificación

### Requirement: Contrato REST documentado
El sistema MUST publicar las operaciones de empresas y administradores en OpenAPI 3.1 con Bearer, scope, validaciones, versiones y errores. MUST responder JSON/no-store; MUST distinguir 400, 401, 403, 404, 409, 503 y 500 sin revelar detalles internos. MUST NOT habilitar DELETE de empresas.

#### Scenario: Documentación verificable
- **WHEN** se consulta /api/docs o /api/openapi
- **THEN** aparecen los contratos reales de listado, creación, detalle, edición, estado y administradores con ejemplos de éxito/error y sin endpoints ficticios

#### Scenario: Sesión y errores
- **WHEN** se llama sin JWT válido, sin permiso, con datos inválidos o con persistencia indisponible
- **THEN** responde respectivamente 401 con WWW-Authenticate, 403, 400 o 503 usando error.code/error.message neutros

### Requirement: Interfaz administrativa segura y responsive
La UI MUST ofrecer listado, formulario, detalle, estado y administradores según grants aplicables. MUST mostrar carga/vacío/error, validaciones y confirmaciones de estado/desasociación; MUST ser utilizable con teclado a 360 y 1280 px. Ocultar acciones MUST NOT sustituir controles backend.

#### Scenario: Flujo de empresa
- **WHEN** APP_ADMIN registra, filtra, abre detalle, edita y confirma desactivación/reactivación
- **THEN** ve el resultado confirmado por servidor, puede cancelar sin cambios y recibe mensajes específicos para validación/conflicto

#### Scenario: Vista local
- **WHEN** COMPANY_ADMIN abre su empresa autorizada
- **THEN** solo ve consulta/edición permitidas y no controles de creación, estado ni administradores de empresa

#### Scenario: Cambio de contexto durante un formulario
- **WHEN** se solicita cambiar contexto con datos sin guardar
- **THEN** se confirma el descarte y, al aceptarlo, se limpian datos y se cancelan/descartan respuestas anteriores
- **AND** una escritura ya enviada no se reintenta automáticamente bajo el nuevo contexto

#### Scenario: Acceso directo y accesibilidad
- **WHEN** se abre una ruta directa sin contexto/permiso o se usa el módulo con teclado en móvil
- **THEN** no se renderizan datos privados sin autorización y los controles autorizados tienen etiquetas, foco y estados anunciados sin desbordamiento horizontal
