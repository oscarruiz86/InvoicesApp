# third-party-management Specification

## Purpose
Administrar terceros y sus relaciones autorizadas con empresas, preservando el aislamiento organizacional, la trazabilidad y los contextos operativos existentes.

## Requirements

### Requirement: Registro de tercero y representación organizacional compatible

El sistema MUST crear terceros con documentType NIT o CC, número de documento, razón social y correo obligatorios. NIT MUST exigir un dígito de verificación; CC MUST NOT admitirlo. nombre comercial, teléfono, dirección y ubicación son opcionales. MUST generar identidad, estado ACTIVE, versión, fechas y actor de creación en el servidor y representación THIRD_PARTY compatible. Los administradores MUST permanecer en asociaciones, no embebidos en el tercero.

#### Scenario: Registro válido desde una empresa autorizada

- **WHEN** un COMPANY_ADMIN autorizado registra NIT con dígito de verificación o CC sin dígito en el ámbito de su empresa
- **THEN** recibe el tercero activo con metadatos de servidor y una relación activa con esa empresa
- **AND** el tercero queda disponible para los flujos que consultan organizaciones sin crear una membresía automáticamente

#### Scenario: Datos opcionales omitidos

- **WHEN** se registra un tercero sin datos de contacto u ubicación opcionales
- **THEN** el sistema conserva valores nulos sin inventar información

#### Scenario: Dígito según tipo documental
- **WHEN** se registra NIT sin dígito de verificación o CC con un dígito
- **THEN** se rechaza la solicitud con INVALID_REQUEST y no se crea tercero ni relación

#### Scenario: Referencias de catálogo
- **WHEN** se registra un tercero con ubicación o tipo documental
- **THEN** el backend valida códigos existentes y relaciones geográficas padre-hijo y devuelve código y etiqueta legible

### Requirement: Validación, normalización y unicidad tributaria

El sistema MUST rechazar campos obligatorios vacíos, propiedades no admitidas, metadatos controlados por servidor y formatos inválidos. MUST recortar textos, normalizar el correo a minúsculas y exigir documentNumber de uno a veinte dígitos sin separadores. NIT MUST requerir dígito de verificación de un dígito; CC MUST rechazarlo. La pareja documentType/documentNumber MUST ser única entre terceros activos e inactivos, sin convertir el correo ni la razón social en identificadores únicos.

#### Scenario: Entrada inválida

- **WHEN** se omite razón social, correo o número de documento, se envía un documento con letras/separadores o el dígito no cumple la regla de su tipo
- **THEN** responde 400 con errores seguros por campo y no crea tercero, relación ni evento de éxito

#### Scenario: Tercero duplicado por tipo y número

- **WHEN** dos operaciones intentan registrar o corregir el mismo tipo y número de documento
- **THEN** solo una puede confirmarse y la otra recibe conflicto sin revelar el registro existente

### Requirement: Relaciones empresariales independientes y trazables

El sistema MUST permitir que un tercero se relacione con varias empresas y que cada empresa se relacione con varios terceros. MUST existir como máximo una relación por pareja empresa-tercero y conservar su estado, versión e historial. Crear, reactivar o desactivar una relación MUST NOT modificar el perfil del tercero, las relaciones con otras empresas ni sus membresías.

#### Scenario: Relación adicional

- **WHEN** una segunda empresa autorizada relaciona un tercero activo existente
- **THEN** se confirma una nueva relación para esa pareja sin duplicar ni alterar la relación anterior

#### Scenario: Relación repetida

- **WHEN** se solicita crear una relación ya activa con versión vigente
- **THEN** se devuelve su estado actual sin registrar una transición duplicada

#### Scenario: Desvinculación aislada

- **WHEN** una empresa desactiva su relación con un tercero compartido
- **THEN** las relaciones activas del tercero con otras empresas permanecen sin cambios

### Requirement: Consulta de terceros aislada por ámbito

El sistema MUST ofrecer listado paginado, búsqueda, filtros por estado, tipo documental y códigos geográficos, y detalle de terceros dentro de un ámbito autorizado. Los filtros, conteos y páginas MUST aplicarse después de verificar el ámbito. APP_ADMIN global podrá consultar terceros conforme a sus permisos; COMPANY_ADMIN se limitará a terceros relacionados con su empresa; THIRD_PARTY_ADMIN se limitará a su propio tercero.

#### Scenario: Tercero de otra empresa no enumerado

- **WHEN** un COMPANY_ADMIN busca un tercero que solo está relacionado con otra empresa
- **THEN** el tercero no aparece ni afecta conteos, páginas o sugerencias

#### Scenario: Acceso directo fuera del ámbito

- **WHEN** un actor autorizado para una empresa solicita el identificador de un tercero ajeno
- **THEN** recibe una respuesta neutra de recurso no encontrado sin revelar datos ni relaciones

#### Scenario: Filtro geográfico por código
- **WHEN** el listado se filtra por códigos de país, departamento o municipio
- **THEN** solo devuelve terceros con referencias coincidentes y no interpreta etiquetas como identificadores

### Requirement: Edición del perfil administrativo separada de identidades

APP_ADMIN global, COMPANY_ADMIN con relación activa y THIRD_PARTY_ADMIN sobre su propio tercero MUST poder editar el perfil administrativo del tercero conforme a sus permisos. Esta gestión MUST NOT editar el perfil personal Keycloak de ningún THIRD_PARTY_ADMIN.

#### Scenario: Edición administrativa autorizada

- **WHEN** uno de los actores autorizados edita datos administrativos admitidos dentro de su ámbito
- **THEN** el sistema guarda únicamente el perfil del tercero y registra el actor y contexto de la operación

#### Scenario: Perfil personal separado

- **WHEN** un actor administra el perfil de una organización THIRD_PARTY
- **THEN** la operación no altera el nombre, correo, documento, credenciales ni otros atributos personales Keycloak de sus THIRD_PARTY_ADMIN
- **AND** solo el propio usuario puede ajustar su perfil personal conforme al contrato de identidad existente

### Requirement: Edición y transiciones protegidas por versión

El sistema MUST exigir la versión vigente para modificar campos de perfil o el estado de una relación. Las ediciones MUST conservar creación y aumentar la versión únicamente ante cambios efectivos. El estado global del tercero y el de cada relación MUST cambiarse mediante operaciones dedicadas; no se permite borrado físico ni actualización masiva de estados desde el perfil.

#### Scenario: Edición concurrente

- **WHEN** se envía una edición basada en una versión obsoleta
- **THEN** responde conflicto y conserva los datos confirmados por la modificación previa

#### Scenario: Desactivación del tercero

- **WHEN** un actor autorizado desactiva un tercero con relaciones y asociaciones existentes
- **THEN** conserva sus registros e historial y deja el tercero no elegible para nuevas operaciones dependientes

#### Scenario: Estado repetido

- **WHEN** se solicita el estado ya vigente usando su versión actual
- **THEN** devuelve la representación actual sin cambiar fechas, versión ni auditoría de transición

### Requirement: Elegibilidad coherente para invitaciones, membresías y contextos

Una invitación, membresía o contexto que refiera a un tercero MUST requerir que el tercero esté activo y, cuando se actúe desde una empresa, que la relación de esa pareja esté activa. Desactivar el tercero o una relación MUST impedir nuevas invitaciones, aceptaciones y resoluciones de contexto incompatibles, sin borrar su historial. Reactivar no concede acceso por sí misma: las asociaciones locales y roles deben seguir vigentes.

#### Scenario: Invitación contra una relación inactiva

- **WHEN** un COMPANY_ADMIN intenta invitar a un administrador o conductor para un tercero cuya relación con su empresa está inactiva
- **THEN** la operación se rechaza sin crear invitación ni asociación

#### Scenario: Contexto previamente elegido

- **WHEN** se desactiva un tercero y el usuario intenta reutilizar su contexto directo
- **THEN** el backend rechaza la resolución y la interfaz limpia el contexto dependiente conforme al ciclo existente
- **AND** desactivar solamente una relación empresa-tercero no invalida un contexto directo de tercero que conserve asociación y permisos vigentes

### Requirement: Confirmación atómica y auditoría administrativa

El sistema MUST confirmar juntos el tercero, su representación organizacional, la relación afectada y la auditoría de una transición. MUST revalidar permisos, estado y versión durante la confirmación, y no afirmar éxito si cualquiera de esos elementos falla. La auditoría MUST conservar actor, instante, recurso, empresa cuando aplique, acción, resultado, correlación, versiones y cambios permitidos, sin secretos ni cuerpos completos.

#### Scenario: Fallo de una escritura relacionada

- **WHEN** falla la persistencia del tercero, la representación, la relación o el evento durante una operación
- **THEN** no queda visible un cambio parcial y la respuesta no afirma éxito

#### Scenario: Revocación concurrente

- **WHEN** una relación o permiso se revoca antes de confirmar una edición iniciada con evidencia anterior
- **THEN** la edición se rechaza o reevalúa con hechos vigentes sin usar la autorización obsoleta

### Requirement: Contrato REST e interfaz administrativa verificables

El sistema MUST publicar operaciones de terceros y relaciones con Bearer, ámbito explícito, validaciones, versiones y errores documentados en OpenAPI 3.1. La interfaz MUST ofrecer listado, formulario, detalle y confirmaciones según permisos, conservar contenido seguro ante cargas o errores y ser utilizable con teclado a 360 px y 1280 px. Ocultar acciones en la interfaz MUST NOT sustituir la autorización backend.

#### Scenario: Documentación y API coherentes

- **WHEN** se consulta la documentación técnica y se ejecuta una operación documentada de terceros
- **THEN** los parámetros, cuerpos, estados exitosos y errores 400, 401, 403, 404, 409, 503 y 500 coinciden con el contrato publicado

#### Scenario: Administración responsive

- **WHEN** un usuario autorizado crea, filtra, edita o desactiva un tercero en móvil o escritorio
- **THEN** los controles tienen etiquetas, foco visible, confirmaciones explícitas y no producen desplazamiento horizontal causado por el layout
