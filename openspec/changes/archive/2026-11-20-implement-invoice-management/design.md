# Design

## Context

La inspección encontró módulos operativos de Identity, Organizations y Fleet, y la ruta Facturas como marcador. Assignment está implementado y archivado; su especificación publicada permite varias relaciones ACTIVE por conductor y vehículo, únicas por par. Sus puertos de lectura actuales no constituyen todavía una confirmación transaccional de alta de factura. No se encontró servicio funcional de Configuration ni almacenamiento de imágenes de factura.

Las imágenes del usuario definen el formulario. El texto NumFac/FecFac/HorFac/NitFac/DocAdq/ValFac/ValIva/ValOtroIm/ValTolFac permite mapear nombres, pero no aprueba un parser QR ni consulta DIAN. La propuesta base conserva esas capacidades como objetivo futuro, no como entrega de este incremento.

## Goals / Non-Goals

**Goals:** modelo Invoice con dominio puro, persistencia y auditoría durables, contrato temporal sustituible y UI consistente con Invitaciones. Registro manual utilizable aunque Configuration siga pendiente; edición cerrada por defecto hasta contar con política efectiva válida.

**Non-Goals:** lectura QR, CUFE, validación fiscal externa, OCR, eliminación, anulación, estados contables, CRUD de parámetros, administración de perfiles o integración de Audit transversal.

## Decisions

### 1. Campos y normalización propuestos para revisión

| Campo visible | Contrato propuesto | Regla |
| --- | --- | --- |
| Vehículo | vehicleId, assignmentId | Par propio ACTIVE; se conserva referencia y snapshot de placa |
| Fecha factura | invoiceDate | Fecha calendario YYYY-MM-DD válida |
| Hora factura | invoiceTime | HH:mm:ss; el formulario admite minutos y completa segundos 00 |
| Número factura | invoiceNumber | Texto 1–64, trim, NFC y mayúsculas para comparación |
| NIT | issuerNit | Texto de dígitos, 1–20; sin validación fiscal ni eliminación de ceros |
| Documento | buyerDocument | Texto 1–40; trim y NFC; no identifica al conductor |
| Valor factura | amount | Decimal string, hasta 14 enteros y 2 decimales |
| IVA | vatAmount | Mismas reglas; cero explícito permitido |
| Otros impuestos | otherTaxesAmount | Mismas reglas; cero explícito permitido |
| Valor total | totalAmount | Suma decimal exacta de los anteriores |
| Imagen factura | image | Opcional en esta propuesta; JPEG/PNG, máximo 5 MiB |

Los campos comerciales son obligatorios; la imagen se propone opcional porque el usuario no indicó obligatoriedad. Se propone COP como única moneda para este incremento, sin conversión ni campo adicional de captura. Importes en Decimal128 y cadenas REST; cálculos mediante unidades menores con BigInt, nunca Number. Fecha/hora comercial usa America/Bogota y se conserva además su interpretación UTC; createdAt/updatedAt son independientes y generados por el servidor.

Alternativa descartada: usar los datos de ejemplo como valores predeterminados o asumir reglas DIAN. Los límites, moneda, suma y obligatoriedad del adjunto son decisiones de esta propuesta, sujetas a su aprobación.

### 2. Propiedad y autorización

| Operación | DRIVER | THIRD_PARTY_ADMIN | APP_ADMIN / COMPANY_ADMIN |
| --- | --- | --- | --- |
| Crear | invoices:create, asignación propia elegible | Sin concesión | Sin concesión |
| Listar / detalle / imagen | invoices:read, propias del tercero | invoices:read, tercero activo | Sin concesión |
| Editar / reemplazar imagen | invoices:update, propia MANUAL elegible | invoices:update, MANUAL elegible del tercero | Sin concesión |

Crear toma ownerSubject del actor y driverId de la asignación; no acepta propietario declarado por cliente. Lecturas históricas no exigen mantener la asignación ACTIVE. La elegibilidad de edición requiere propietario conductor aún elegible en su tercero, origen MANUAL y plazo efectivo, pero no reabre ni sustituye una asignación cerrada. Esta decisión permite corregir datos comerciales después del cierre sin alterar su referencia histórica.

### 3. Confirmación entre módulos

Invoice application define puertos estrechos para autorización, Assignment facts/confirmation, política temporal, reloj, repositorio y auditoría. Los adaptadores llaman contratos públicos; no consultan colecciones de otros propietarios. Fleet debe exponer evidencia con assignmentId, versiones, subject, conductor, vehículo y tercero, más confirmación vinculada a sesión. Los fences del productor deben serializar el alta con cierre de asignación, desactivación y revocación; una lectura snapshot aislada no basta.

La asignación se valida al confirmar, no contra una fecha comercial retroactiva. Un conductor elige entre sus vehículos asignados; el servidor resuelve el par propio, nunca el primer conductor del vehículo.

### 4. Política temporal y servicio pendiente

Se define un InvoiceEditPolicyReader con duración positiva en segundos, revisión, ámbito y vigencia. La evaluación usa política efectiva al editar, fecha de creación del registro y borde exclusivo: now < createdAt + duración. Un cambio de duración afecta a facturas existentes evaluadas después del cambio. No hay duración predeterminada ni copia de reglas en variables de entorno.

Mientras Configuration no exista, bootstrap inyecta un adaptador explícitamente no disponible: PATCH devuelve 503 EDIT_POLICY_UNAVAILABLE; crear/listar/consultar permanecen funcionales. Cuando llegue Configuration, un adaptador real y una confirmación de revisión sustituirán ese puerto; habilitar edición requiere esa evidencia. Las respuestas incluyen editability con razón no disponible, plazo agotado o permiso insuficiente para guiar la interfaz, siempre revalidada por backend.

### 5. Persistencia, adjunto y auditoría

Invoice es raíz con versión, origen MANUAL inmutable, vínculos y metadatos. No hay ciclo de estados comercial aprobado: no se inventa uno. Índice único (thirdPartyId, issuerNit normalizado, invoiceNumber normalizado). Clave de idempotencia única por actor/tercero con hash del contenido normalizado e imagen; un reintento tras revocación no revela resultados sin autorización actual.

Se propone almacenar imagen binaria privada en colección invoice_images, con identificador opaco, hash, tipo y tamaño; máximo 5 MiB mantiene cada documento por debajo del límite BSON. Factura, imagen y invoice_management_events se confirman en una transacción MongoDB. Esto evita añadir proveedor externo o coordinar objetos fuera de Mongo en este incremento. Alternativa GridFS/objeto externo reservada para mayores tamaños o volumen.

Verificar firma y decodificar JPEG/PNG con límites de dimensiones, retirar metadatos y rechazar SVG/HTML/archivos remotos. Seleccionar dependencia mantenida de validación de imágenes al aplicar, con revisión de compatibilidad y seguridad. La lectura exige permiso sobre la factura y responde no-store/nosniff; nombre original nunca define ruta. El reemplazo usa misma política y versión que la edición; el binario anterior se retira solo dentro de la transacción confirmada.

### 6. REST y composición

- POST /api/invoices: multipart con payload JSON estricto y image opcional; Idempotency-Key; 201 o resultado previo en reintento.
- GET /api/invoices: page, pageSize 1–100, q por número/NIT, vehicleId, dateFrom/dateTo y orden invoiceDate, invoiceNumber, totalAmount o createdAt con desempate por id.
- GET /api/invoices/{id}: detalle y editability.
- PATCH /api/invoices/{id}: multipart, expectedVersion, cambios comerciales y reemplazo opcional de imagen; no cambia vehículo, propietario, tercero, origen ni asignación.
- GET /api/invoices/{id}/image: binario protegido o 404.

Todas usan Bearer y scope=organization&thirdPartyId explícitos. Errores: 400 formato/total, 401 sesión, 403 permiso/ventana agotada, 404 neutral, 409 versión/duplicidad/evidencia obsoleta, 413 tamaño, 415 tipo, 503 proveedor no disponible y 500 imprevisto neutro. La edición sin cambios conserva versión y no duplica eventos, tras autorización.

backend/src/modules/invoices y frontend/src/modules/invoices usan domain/application/infrastructure/presentation; bootstrap y app componen adaptadores. Route Handlers delgados, frontend sin modelos Mongo. Nuevos contratos Fleet permanecen propiedad de Fleet.

### 7. Distribución y reutilización de Invitaciones

Reutilizar theme, DataTable/Surface/Action/SortHeader, DataPagination, TableLoadingState, SuccessNotice y normalización de errores. Igual patrón de filtros en Dialog con borradores, Aplicar/Limpiar y chips; no copiar búsqueda de identidad ni delegación de roles.

Formulario ordenado en bloques: (1) vehículo y resumen del tercero/conductor, (2) fecha y hora, (3) número y NIT, (4) documento adquiriente, (5) valor, IVA y otros impuestos, (6) total, (7) imagen y vista previa. Una columna en móvil; pares fecha/hora y número/NIT en escritorio; importes en fila si caben; documento, total y adjunto de ancho completo. Dialog con contenido desplazable y acciones visibles; etiquetas persistentes, teclado, foco, errores por campo y 360/1280 px sin desbordamiento de página.

Tabla: número, fecha/hora, emisor, vehículo, total y acciones; tarjetas equivalentes en móvil. context.capture(), AbortSignal y generación descartan respuestas obsoletas y limpian previews de imagen. Prevenir doble envío y refrescar tras guardar; conservar borrador ante errores recuperables.

## Risks / Trade-offs

- [Configuration ausente] → edición deliberadamente indisponible; no presentar este estado como módulo completo de parámetros.
- [Confirmación Fleet insuficiente] → añadir puerto transaccional público con fences y probar carreras antes de aceptar altas.
- [Muchos a muchos ignorado por código antiguo] → elegir asignación propia por par, sin unicidad individual por vehículo o conductor.
- [Binarios aumentan almacenamiento Mongo] → límite 5 MiB, control de dimensiones y métricas; revisar otro almacenamiento en cambio posterior.
- [Reglas comerciales de ejemplo no confirmadas] → aprobación de la propuesta debe revisar COP, adjunto opcional, suma y clave de duplicidad.

## Migration Plan

Inventariar colecciones objetivo solo lectura antes de crear índices; no asumir vacías por ausencia del módulo. Si hay filas previas, bloquear inicialización ante incompatibilidad y producir reporte sin datos personales completos; no inventar propietario o asignación. Ensayar índices/transacciones en replica set de prueba. Desplegar lecturas y altas con edición cerrada cuando no exista política. Rollback deshabilita rutas/UI y conserva facturas, imágenes y eventos; no elimina datos ni modifica Keycloak.
