# Spec Delta

## ADDED Requirements

### Requirement: Proveedor único de imágenes configurable

Las imágenes de factura MUST almacenarse mediante el único proveedor seleccionado por configuración de servidor. La primera implementación MUST admitir `local`; un proveedor ausente, no soportado o incompleto MUST impedir la operación de imagen con un error neutro y MUST NOT activar otro proveedor como respaldo implícito.

#### Scenario: Proveedor local seleccionado
- **GIVEN** configuración válida para el proveedor `local`
- **WHEN** se crea, consulta o reemplaza una imagen de factura autorizada
- **THEN** la operación usa exclusivamente el almacenamiento local configurado

#### Scenario: Proveedor inválido
- **WHEN** una ruta de factura que necesita una imagen se ejecuta con proveedor ausente, desconocido o incompleto
- **THEN** responde un error de configuración neutro sin escribir la factura, la referencia ni el archivo

### Requirement: Clave jerárquica y segura del objeto

Cada imagen local MUST usar la clave `<empresa>/<tercero>/<vehiculo>/<factura>/imagen.<ext>`, formada solo con identificadores internos validados y extensión derivada del contenido normalizado. `empresa` MUST ser el namespace técnico configurado y MUST NOT alterar el ámbito de autorización de la factura. Ningún segmento MUST permitir rutas absolutas ni traversal.

#### Scenario: Imagen PNG normalizada
- **GIVEN** namespace e identificadores internos válidos
- **WHEN** se almacena una imagen cuyo contenido normalizado es PNG
- **THEN** el objeto queda en `<empresa>/<tercero>/<vehiculo>/<factura>/imagen.png` dentro de la raíz configurada

#### Scenario: Segmento inseguro
- **WHEN** cualquier segmento de la clave intenta escapar de la raíz o no cumple el formato interno permitido
- **THEN** la operación se rechaza antes de crear, leer, reemplazar o eliminar archivos

### Requirement: Referencia durable sin binario nuevo en MongoDB

Las nuevas mutaciones MUST guardar en MongoDB proveedor, clave, tipo, tamaño, dimensiones y hash de la imagen, pero MUST NOT guardar su binario. La lectura MUST verificar que el objeto corresponde con la referencia y MUST fallar de forma neutra ante ausencia o discrepancia, sin buscar silenciosamente otro proveedor.

#### Scenario: Alta con imagen persistida
- **WHEN** se confirma una factura nueva con imagen válida
- **THEN** MongoDB conserva la referencia y metadatos del objeto y no contiene una copia nueva del binario

#### Scenario: Objeto ausente o alterado
- **WHEN** la referencia existe pero el objeto no está disponible o no coincide con sus metadatos verificables
- **THEN** la descarga falla de forma neutra sin devolver contenido parcial ni consultar un proveedor alternativo

## MODIFIED Requirements

### Requirement: Adjuntos privados

El sistema MUST aceptar como máximo una imagen JPEG o PNG de hasta 5 MiB después de normalizarla, validar contenido y dimensiones y servirla únicamente tras autorizar acceso a la factura. MUST NOT exponer la raíz, clave o ruta pública, ni aceptar URLs remotas. Agregar o reemplazar imagen después del alta MUST aplicar la política y versión de edición.

#### Scenario: Imagen inválida
- **WHEN** se envía un archivo con tipo real diferente, tamaño excesivo, dimensiones no admitidas o contenido inválido
- **THEN** se rechaza la operación sin crear referencia rota ni adjunto accesible

#### Scenario: Descarga autorizada sin revelar ubicación
- **WHEN** un actor autorizado solicita la imagen mediante el endpoint privado de la factura
- **THEN** recibe el JPEG o PNG validado y la respuesta no revela proveedor, raíz ni clave de almacenamiento

### Requirement: Historia y trazabilidad durables

Cada mutación MUST confirmar factura, referencia de adjunto y evento durable de forma consistente, revalidando autoridad y revisiones consumidas. Como el objeto no participa en la transacción MongoDB, MUST aplicarse una compensación verificable que evite publicar referencias rotas y retire objetos nuevos no referenciados. El evento MUST omitir binario, documento completo y ubicación física.

#### Scenario: Fallo del evento
- **WHEN** falla la captura durable de auditoría después de preparar un objeto nuevo
- **THEN** no se confirma la mutación, se conserva el estado anterior y el objeto preparado se elimina o queda registrado para reconciliación segura

#### Scenario: Fallo al reemplazar imagen
- **WHEN** falla la escritura o verificación de la imagen reemplazante
- **THEN** se conservan la factura, la referencia y la imagen anterior sin publicar el reemplazo

#### Scenario: Confirmación antes de retirar la imagen anterior
- **WHEN** un reemplazo se confirma en MongoDB con la nueva referencia y su auditoría
- **THEN** la imagen anterior se elimina después de la confirmación o queda registrada para limpieza reintentable sin afectar la lectura nueva
