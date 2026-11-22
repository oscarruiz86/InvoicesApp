# Spec Delta

## Purpose

Capturar contenido QR de facturas mediante cámara o imagen local para revisar datos completos y confirmar su registro autorizado, sin extracción fiscal remota ni transcripción de campos faltantes.

## ADDED Requirements

### Requirement: Captura local y liberación de recursos

La interfaz MUST ofrecer cámara e imagen local como entradas de captura. MUST solicitar cámara solo por acción explícita y detenerla al cancelar, salir, cambiar contexto o aceptar una lectura. MUST informar permiso denegado, falta de cámara o contexto inseguro y mantener la alternativa de imagen.

#### Scenario: Cámara no disponible
- **WHEN** el navegador no puede habilitar la cámara
- **THEN** muestra una explicación y permite seleccionar una imagen local sin permisos de cámara

#### Scenario: Salida durante lectura
- **WHEN** se cierra el diálogo o cambia el tercero activo
- **THEN** se detienen los tracks, se limpian imágenes y datos y se descartan resultados pendientes

### Requirement: Parsing estricto y completo

El parser MUST exigir NumFac, FecFac, HorFac, NitFac, DocAdq, ValFac, ValIva, ValOtroIm y ValTolFac con valores válidos. CUFE y QRCode serán opcionales y validados cuando aparezcan. MUST rechazar campos obligatorios ausentes, claves duplicadas, valores ambiguos, formato incompatible y contenido que solo contenga una URL.

#### Scenario: Campo requerido ausente
- **WHEN** falta algún campo comercial obligatorio o está vacío
- **THEN** informa los nombres de campos faltantes, impide registrar y permite otra lectura sin habilitar entrada manual

#### Scenario: URL como único contenido
- **WHEN** se decodifica una URL sin el contenido estructurado requerido
- **THEN** informa formato no soportado y no navega ni consulta esa dirección

### Requirement: Revisión protegida antes del registro

Los datos extraídos MUST mostrarse en solo lectura y MUST NOT corregirse ni completarse desde el flujo QR. El usuario MUST seleccionar una asignación propia elegible y confirmar explícitamente. La captura visual MUST NOT crear la factura por sí sola ni adjuntar automáticamente la imagen utilizada para leer.

#### Scenario: Captura válida
- **WHEN** se lee contenido válido y completo
- **THEN** presenta los datos bloqueados, selección de vehículo/asignación y opción independiente de adjuntar imagen antes de confirmar

#### Scenario: Varios códigos en la escena
- **WHEN** hay varios códigos visibles o la lectura no corresponde a la factura deseada
- **THEN** se pausa tras un resultado, permite rechazarlo y exige nueva captura enfocada antes de confirmar

### Requirement: Datos no confiables y privacidad

El servidor MUST volver a parsear el contenido recibido y derivar los campos de factura sin aceptar valores comerciales sobrescritos. MUST NOT considerar origen QR una prueba de autenticidad fiscal. URLs MUST tratarse como datos no confiables sin navegación automática; imágenes y contenido MUST NOT enviarse a decodificadores de terceros.

#### Scenario: Intento de sobrescribir un importe
- **WHEN** la solicitud QR incluye un importe adicional o metadatos de origen manipulados
- **THEN** responde 400 sin registrar la factura

### Requirement: Errores y accesibilidad de captura

El flujo MUST diferenciar lectura ilegible, contenido inválido, duplicado, falta de permiso y fallo de servicio. MUST prevenir doble envío, soportar teclado, conservar foco y ofrecer distribución utilizable a 360 y 1280 px con los patrones visuales compartidos de Facturas e Invitaciones.

#### Scenario: Error recuperable
- **WHEN** falla el registro por indisponibilidad temporal y el contexto permanece vigente
- **THEN** conserva la revisión para reintentar con la misma clave de idempotencia sin escanear ni crear dos facturas
