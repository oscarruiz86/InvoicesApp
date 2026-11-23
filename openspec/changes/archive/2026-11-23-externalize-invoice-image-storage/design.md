# Design

## Context

Véase [proposal.md](./proposal.md) para la motivación. Hoy `normalizeInvoiceImage` produce un `Buffer` validado y `createMongoInvoiceRepository` inserta ese binario en `invoice_images` dentro de la misma transacción que factura, idempotencia y auditoría. `GET /api/invoices/{id}/image` autoriza primero la factura y después lee esa colección.

El agregado `Invoice` contiene `thirdPartyId`, `vehicleId`, `invoiceId` e `imageId`, pero no `companyId`; además, un tercero puede relacionarse con varias empresas. No existe una empresa de negocio única que pueda inferirse sin cambiar el modelo funcional. Como el producto está en desarrollo, los datos actuales son descartables y el nuevo esquema se implementará directamente, sin migración ni compatibilidad con binarios existentes.

## Goals / Non-Goals

**Goals:**

- Separar contenido binario y metadatos sin cambiar el multipart, `imageUrl` ni el endpoint privado.
- Seleccionar un único adaptador por `.env`, manteniendo Application independiente del filesystem.
- Hacer determinística, privada y portable entre Windows/Linux la clave local solicitada.
- Evitar entregar bytes incorrectos y recuperar altas o reemplazos interrumpidos.
- Crear nuevas facturas únicamente con referencias externas verificables.

**Non-Goals:**

- Migrar, inventariar o leer imágenes almacenadas previamente como binario en MongoDB.
- Preservar facturas o imágenes actuales del entorno de desarrollo.
- Implementar S3, Azure Blob, GCS, MinIO u otro proveedor adicional.
- Exponer URLs firmadas, rutas estáticas o acceso directo desde el frontend.
- Incorporar `companyId` al agregado Invoice o cambiar autorización organizacional.
- Cambiar formatos, límite de 5 MiB, límite de píxeles o contrato HTTP.
- Resolver replicación multi-host del proveedor local.

## Decisions

### 1. Puerto de objetos separado del repositorio de facturas

Application recibirá dos contratos:

- `InvoiceRepositoryPort`: factura, idempotencia, referencia/metadatos de imagen y auditoría transaccional.
- `InvoiceImageStoragePort`: preparar, activar, leer con verificación, compensar y retirar objetos.

La única referencia válida tendrá `provider`, `key`, `contentType`, `size`, `width`, `height` y `sha256`; `imageId` seguirá siendo la identidad interna. El caso de uso autorizará primero, obtendrá la referencia del repositorio y solo entonces pedirá los bytes al storage. Los errores del adaptador se traducirán a `INVOICE_STORAGE_UNAVAILABLE`, sin filtrar rutas.

Se descarta mantener una variante de contenido MongoDB o un fallback: introduciría complejidad destinada a datos descartables y ocultaría configuraciones u objetos ausentes.

### 2. Registro cerrado de proveedores seleccionado por entorno

`readServerEnvironment` añadirá:

- `INVOICE_IMAGE_STORAGE_PROVIDER=local`
- `INVOICE_IMAGE_STORAGE_LOCAL_ROOT=<ruta absoluta privada>`
- `INVOICE_IMAGE_STORAGE_COMPANY_ID=<namespace de 24 caracteres hexadecimales>`

El parser valida forma y dependencias condicionales sin tocar disco. `invoice-endpoint` construye un registro cerrado `{ local: factory }` y selecciona exactamente un adaptador; no existe fallback. Las rutas privadas de Invoice conservan `CONFIGURATION_ERROR` cuando falta configuración, mientras build, lint y generación OpenAPI no abren ni crean la raíz.

Se descarta elegir proveedor por solicitud o guardar credenciales en la factura porque ampliaría la superficie de entrada no confiable.

### 3. `empresa` será namespace técnico, no asociación inferida

La clave canónica será:

```text
<companyNamespace>/<thirdPartyId>/<vehicleId>/<invoiceId>/imagen.<png|jpg>
```

Los cuatro identificadores deben cumplir `/^[a-f0-9]{24}$/`; la extensión se obtiene del `contentType` normalizado, nunca del nombre enviado. `INVOICE_IMAGE_STORAGE_COMPANY_ID` llena el primer segmento y no participa en autorización, filtros ni respuestas.

Se descarta usar razón social, placa o número de factura porque son mutables, pueden contener caracteres inseguros y exponen datos de negocio. Incorporar una empresa real a Invoice requeriría otra propuesta funcional.

### 4. Adaptador local endurecido y escrituras atómicas por archivo

El adaptador resolverá la clave contra la raíz absoluta y comprobará que el resultado permanezca bajo ella. Rechazará separadores, `.`/`..`, rutas absolutas, enlaces simbólicos en directorios administrados y archivos no regulares. Creará directorios privados y archivos con permisos mínimos compatibles con el sistema operativo.

La escritura se hará en un temporal exclusivo dentro del mismo directorio, verificará tamaño y SHA-256, sincronizará y renombrará atómicamente al nombre final. La lectura abrirá sin seguir enlaces cuando la plataforma lo permita, limitará bytes, recalculará SHA-256 y comprobará metadatos antes de devolver contenido. Nunca se concatenará entrada libre para formar rutas.

Se usarán primitivas nativas de Node.js; no se incorpora una biblioteca de storage para una única implementación filesystem.

### 5. Saga objeto-primero con compensación

**Alta:** se prepara y activa el objeto; después la transacción MongoDB confirma factura, referencia, idempotencia y auditoría. Si la transacción falla o devuelve una factura idempotente distinta de la candidata, se retira el objeto candidato. Un crash entre ambos pasos solo puede dejar un objeto huérfano, nunca una referencia a bytes no escritos.

**Reemplazo:** el adaptador escribe un temporal. Si cambia la extensión, activa la nueva clave y conserva la anterior hasta confirmar MongoDB. Si conserva extensión, mueve la versión actual a un backup privado y activa el temporal. Tras confirmar referencia y auditoría se retira la versión anterior; ante fallo se restaura el backup o elimina la candidata.

Cada operación local deja un journal técnico mínimo, sin datos comerciales ni binario, con fase y claves. La recuperación de storage usa ese journal para restaurar backups o retirar temporales/candidatos no confirmados. Durante la corta ventana de reemplazo, una discrepancia de hash produce indisponibilidad neutra; nunca se entregan bytes que no correspondan a la referencia leída.

El journal resuelve fallos de operaciones nuevas; no constituye inventario ni migración de datos anteriores.

### 6. Esquema nuevo sin compatibilidad legada

`invoice_images` conservará `_id` e `invoiceId` y almacenará versión de esquema, proveedor, clave y metadatos, sin campo `data`. El decodificador aceptará únicamente esta forma. Un documento binario anterior será inválido y no disparará lectura alternativa.

Antes de habilitar la nueva versión en desarrollo se limpiarán las colecciones de facturas/imágenes o se recreará la base de desarrollo mediante el procedimiento habitual del proyecto. Esta limpieza no forma parte de una migración de producción ni se automatizará dentro del runtime.

### 7. Compose, persistencia y recuperación

`compose.yaml` añadirá un volumen nombrado exclusivo montado solo en backend, por ejemplo en `/var/lib/invoices/images`, y las tres variables del proveedor. El modo host usará una ruta absoluta definida en `.env.local`; cualquier carpeta sugerida dentro del repositorio estará ignorada.

README y `.env.example` documentarán capacidad, permisos, arranque, validación y recuperación. Para respaldar un entorno de desarrollo que se quiera conservar, se pausarán escrituras y se copiarán MongoDB y el volumen como un conjunto. Health seguirá expresando vida del proceso y no disponibilidad del storage.

### 8. Diferencia entre importes QR durante edición administrativa

La captura QR conserva los importes interpretados desde el origen, aunque el total no coincida aritméticamente con valor, IVA y otros impuestos. En edición por `THIRD_PARTY_ADMIN`, se conserva ese comportamiento: cada importe debe ser un decimal no negativo válido de hasta dos decimales, pero no se aplica una tolerancia de diferencia ni una validación de suma exacta. Por tanto, una diferencia de `$0,51` no es un umbral; se aceptan importes individualmente válidos aunque su suma no coincida. Las facturas manuales mantienen la validación de suma exacta.

## Risks / Trade-offs

- [No hay transacción común entre MongoDB y filesystem] → saga objeto-primero, backups de reemplazo, journal y compensación idempotente.
- [Crash durante reemplazo del mismo formato] → temporales/backups en el mismo directorio y recuperación basada en el journal de la operación.
- [Los datos actuales dejan de ser legibles] → decisión explícita aceptada para desarrollo; limpiar y recrear datos antes de validar.
- [Namespace técnico puede confundirse con empresa de negocio] → nombre y documentación explícitos; no se expone ni usa para autorización.
- [Crecimiento del disco por fallos repetidos] → recuperación de journals y limpieza segura de candidatos creados por operaciones conocidas.
- [Filesystem comprometido mediante symlink o traversal] → segmentos cerrados, resolución bajo raíz, rechazo de symlinks, archivos regulares y permisos mínimos.
- [Varias réplicas con disco no compartido producirían lecturas inconsistentes] → declarar proveedor local de instancia/volumen único; exigir storage compartido antes de escalar horizontalmente.

## Implementation Plan

1. Crear la rama `openspec/externalize-invoice-image-storage` desde `development` e implementar configuración, puerto, adaptador y pruebas.
2. Sustituir el documento binario por el esquema de referencia externa y actualizar los casos de uso con la saga y compensación.
3. Añadir volumen, variables y documentación para host/Compose.
4. Limpiar los datos descartables de facturas/imágenes del entorno de desarrollo antes de probar el nuevo esquema.
5. Verificar alta manual, alta QR con adjunto, reemplazo, descarga autorizada, 404 neutral, reinicio y recuperación de operaciones interrumpidas.

**Rollback:** detener el backend, volver al código anterior y recrear nuevamente los datos de desarrollo. No se promete conservar registros creados con ninguno de los dos esquemas durante el cambio.
