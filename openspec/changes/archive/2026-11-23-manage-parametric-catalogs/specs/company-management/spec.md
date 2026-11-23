# Spec Delta

## MODIFIED Requirements

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
El sistema MUST rechazar campos obligatorios ausentes/vacíos, formatos inválidos y propiedades no admitidas. MUST recortar textos, normalizar email a minúsculas y exigir documentNumber de 1–20 dígitos sin separadores, conservando ceros iniciales. Para NIT MUST requerir verificationDigit de un dígito; para CC MUST rechazar verificationDigit. No debe calcularlo automáticamente.

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

### Requirement: Consultas paginadas y aisladas
El sistema MUST ofrecer listado con búsqueda literal por prefijo en documentNumber, businessName o tradeName, filtros status, documentType y códigos country/department/city, ordenamiento permitido y paginación. MUST aplicar pertenencia antes de filtros, conteo y paginación, y usar orden estable. El listado organizacional MUST limitarse a la empresa seleccionada.

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
