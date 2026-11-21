# Facturas: reglas comerciales y despliegue

## Reglas comerciales

- Esta entrega registra facturas de origen `MANUAL`. El cliente no puede declarar origen, propietario ni vínculos de organización.
- Los importes se capturan como cadenas decimales COP no negativas, con hasta 14 dígitos enteros y 2 decimales. No se redondea. El total debe ser exactamente valor + IVA + otros impuestos.
- El NIT emisor conserva ceros iniciales y contiene de 1 a 20 dígitos. El número de factura se normaliza con NFC, trim y mayúsculas para comparar. La clave comercial se limita al tercero.
- Documento adquiriente se conserva como texto NFC y no se contrasta con Keycloak.
- Fecha comercial es `YYYY-MM-DD`; hora, `HH:mm:ss`. El servidor deriva `invoiceAtUtc` interpretando esa hora en `America/Bogota` y registra aparte los instantes UTC de creación y actualización.
- La imagen es opcional; si se adjunta, el contrato admite JPEG o PNG hasta 5 MiB.
- `assignmentId`, `driverId`, `vehicleId`, `thirdPartyId` y propietario son referencias históricas y no se alteran al editar datos comerciales.
- El diseño plantea COP, suma exacta, imagen opcional y unicidad de NIT+número dentro del tercero. Cambiar estas reglas requiere una decisión comercial explícita y la actualización de OpenSpec.

## Límite entre Fleet e Invoices

Invoices solo pide a Fleet hechos de una relación `assignmentId` + `vehicleId` propia del conductor. Fleet confirma de nuevo esa misma asignación dentro de la transacción de escritura, verifica que siga activa junto al vehículo, conductor, tercero y membresía, y aplica fences de mutación a esos registros. La lectura inicial solo guía la solicitud; nunca autoriza por sí sola. No se accede a `vehicle_assignments`, `vehicles` ni `drivers` desde código de Invoices.

## Autorización

| Operación | Conductor (`DRIVER`) | Administrador del tercero (`THIRD_PARTY_ADMIN`) | Otros roles |
| --- | --- | --- | --- |
| Alta | Permitida con asignación propia activa | Denegada | Denegada |
| Listado, detalle e imagen | Solo facturas propias | Facturas del tercero activo | Denegado |
| Edición | Solo facturas propias elegibles | Facturas del tercero activo elegibles | Denegada |

La API exige `scope=organization` y `thirdPartyId` explícito. El ámbito se autoriza antes de consultar por ID, imagen o contar/paginar; la consulta de conductor incluye `ownerSubject` en Mongo. Cerrar o invalidar una asignación no elimina facturas históricas ni cambia sus vínculos. Las escrituras vuelven a confirmar permiso y evidencia vigente dentro de la transacción.

Ejemplo de alta, usando valores ficticios:

```http
POST /api/invoices?scope=organization&thirdPartyId=0123456789abcdef01234567
Authorization: Bearer <access-token>
Idempotency-Key: 7e246bc4-5df6-4fe8-9f8d-917ecdd15210
Content-Type: multipart/form-data

payload={"assignmentId":"1123456789abcdef01234567","vehicleId":"2123456789abcdef01234567","invoiceDate":"2026-11-20","invoiceTime":"12:30:00","invoiceNumber":"FAC-001","issuerNit":"900123456","buyerDocument":"900654321","amount":"100.00","vatAmount":"19.00","otherTaxesAmount":"0.00","totalAmount":"119.00"}
image=<archivo JPEG o PNG opcional>
```

Las respuestas JSON nunca incluyen el propietario interno ni bytes de imagen. `imageUrl` apunta a la ruta protegida del mismo tercero; usarla requiere una nueva autorización vigente.

## Almacenamiento de imágenes

El backend usa `sharp` 0.35.5, ya presente en el lockfile de Next, como dependencia directa fijada. Decodifica JPEG/PNG con límite de 40 megapíxeles, corrige orientación, vuelve a codificar para quitar EXIF/GPS y demás metadatos, y rechaza contenido falso, tamaño superior a 5 MiB o dimensiones inválidas. Los bytes se guardan en `invoice_images` en la misma transacción Mongo que la factura y el evento; no hay ruta ni URL pública.

## Estado de despliegue

Las rutas de facturas deben iniciar con edición deshabilitada mientras Configuration no provea una política temporal efectiva. Habilitar PATCH requiere un adaptador de Configuration que entregue duración positiva, ámbito, revisión y vigencia para el tercero, más confirmación transaccional de esa revisión al persistir. Cada edición vuelve a evaluar la política vigente contra `createdAt`; el límite es exclusivo y no se guarda una duración por factura. Sin ese proveedor, PATCH devuelve `EDIT_POLICY_UNAVAILABLE` (HTTP 503), mientras altas y lecturas siguen operativas.

Antes de instalar índices, ejecutar inventario de solo lectura sobre las colecciones objetivo y bloquear la inicialización si aparecen datos incompatibles. La persistencia requiere replica set para transacciones. El rollback deshabilita rutas y UI y conserva documentos, imágenes y eventos; no elimina datos ni cambia Keycloak.

El comando `npm --prefix backend run invoices:inventory` informa únicamente conteos de filas incompatibles, duplicados comerciales/idempotentes y referencias de imagen huérfanas; no imprime documentos personales ni escribe índices. Debe ejecutarse contra la base destino antes del despliegue. El bootstrap de Invoices repite la comprobación completa y no crea índices si `ready` es falso. Al rollback se apagan rutas y UI; se conservan datos e índices.
