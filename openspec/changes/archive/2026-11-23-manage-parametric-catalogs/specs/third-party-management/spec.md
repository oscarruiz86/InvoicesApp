# Spec Delta

## MODIFIED Requirements

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
El sistema MUST rechazar campos obligatorios vacíos, propiedades no admitidas, metadatos controlados por servidor y formatos inválidos. MUST recortar textos y normalizar el correo a minúsculas. documentNumber MUST contener de uno a veinte dígitos sin separadores. NIT MUST requerir un dígito de verificación de un solo dígito; CC MUST rechazar ese campo. La pareja tipo y número de documento MUST ser única entre terceros activos e inactivos, sin convertir correo o razón social en identificadores únicos.

#### Scenario: Entrada inválida
- **WHEN** falta razón social, correo o número de documento, correo es inválido, número contiene letras/separadores o el dígito no cumple la regla de su tipo
- **THEN** responde 400 con errores seguros por campo y no crea tercero, relación ni evento de éxito

#### Scenario: Tercero duplicado por tipo y número
- **WHEN** dos operaciones intentan registrar o corregir el mismo tipo y número de documento
- **THEN** solo una puede confirmarse y la otra recibe conflicto sin revelar el registro existente

### Requirement: Consulta de terceros aislada por ámbito
El sistema MUST ofrecer listado paginado, búsqueda, filtros por estado, tipo documental y códigos geográficos, y detalle dentro de un ámbito autorizado. Los filtros, conteos y páginas MUST aplicarse después de verificar el ámbito. APP_ADMIN global podrá consultar terceros conforme a sus permisos; COMPANY_ADMIN se limitará a terceros relacionados con su empresa; THIRD_PARTY_ADMIN se limitará a su propio tercero.

#### Scenario: Tercero de otra empresa no enumerado
- **WHEN** un COMPANY_ADMIN busca un tercero que solo está relacionado con otra empresa
- **THEN** el tercero no aparece ni afecta conteos, páginas o sugerencias

#### Scenario: Acceso directo fuera del ámbito
- **WHEN** un actor autorizado para una empresa solicita el identificador de un tercero ajeno
- **THEN** recibe una respuesta neutra de recurso no encontrado sin revelar datos ni relaciones

#### Scenario: Filtro geográfico por código
- **WHEN** el listado se filtra por códigos de país, departamento o municipio
- **THEN** solo devuelve terceros con referencias coincidentes y no interpreta etiquetas como identificadores
