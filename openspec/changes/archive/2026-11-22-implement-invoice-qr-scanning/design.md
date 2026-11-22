# Design

## Context

Facturas ya está implementado y archivado como 2026-11-20-implement-invoice-management. El dominio InvoiceOrigin, decodificador de repositorio y schema Zod frontend solo admiten MANUAL. POST manual usa multipart estricto; la misma aplicación coordina asignación, idempotencia e historial. La UI y bootstrap no tienen escáner. Configuration sigue siendo una dependencia de edición manual, no necesaria para crear QR.

## Goals / Non-Goals

**Goals:** ampliar Invoice y sus casos de uso sin duplicar flujos de persistencia; decodificar localmente cámara/imagen y tratar el contenido como entrada no confiable.

**Non-Goals:** completar datos faltantes manualmente, corrección de QR, consulta DIAN, extracción de páginas, OCR, verificación fiscal o cambios Keycloak. Una factura manual separada sigue disponible si el usuario abandona QR, sin conservar la atribución QR.

## Decisions

### Captura local mediante adaptador

Se proponen cámara e imagen JPEG/PNG local (máximo 5 MiB y 20 megapíxeles) con el mismo resultado textual. El área de escaneo enfoca un único código y pausa al primer resultado; el usuario revisa/rechaza antes de continuar. No se garantiza enumerar todos los códigos de una imagen; puede recortar y volver a leer si el resultado no es el esperado.

Se selecciona `qr-scanner@1.4.2`, detrás de `QrDecoderPort` en application e implementación en infrastructure, con importación diferida y worker empaquetado localmente. Su documentación describe cámara, imágenes, procesamiento mediante worker y licencia MIT. ZXing Browser es alternativa para formatos adicionales pero el alcance solo requiere QR. BarcodeDetector solo no es suficiente como estrategia de compatibilidad. La revisión de implementación fijó la versión y licencia, y el build Vite confirmó el adaptador y worker locales sin CDN. La publicación npm es antigua, por lo que el puerto mantiene abierta la posibilidad de reemplazar la biblioteca.

Referencias consultadas: https://github.com/nimiq/qr-scanner y https://github.com/zxing-js/browser . La validación real en navegadores y dispositivos es tarea de implementación, no evidencia de esta propuesta.

### Sincronización de dependencias de desarrollo

Compose monta `frontend-modules` en `/app/node_modules`. Los volúmenes nombrados sobreviven a la reconstrucción de la imagen; por eso un lockfile actualizado podía coexistir con un `node_modules` anterior y hacer que Vite reportara `Failed to resolve import "qr-scanner"`. El entrypoint de desarrollo compara el SHA-256 de `package-lock.json` con un marcador dentro del volumen y corre `npm ci` cuando no coinciden, antes de ejecutar Vite. El build local posterior resolvió el import y emitió los chunks locales del lector y el worker.

La evidencia E2E previa cubre el flujo con cámara simulada (4/4 pruebas). La ejecución de seguimiento no pudo iniciar Playwright porque el ejecutable Chromium requerido no estaba instalado en el entorno. Sigue pendiente probar cámara física en HTTPS con permisos concedidos y denegados en un dispositivo real; esta limitación se registra en `tasks.md` como tarea 5.3.

La cámara requiere contexto seguro compatible (HTTPS o localhost de desarrollo), permisos y navegador con mediaDevices; HTTP en IP de LAN no se considera soportado para cámara. Imagen local ofrece alternativa con teclado. Detener tracks/worker y revocar object URLs al salir o cambiar contexto.

### Formato soportado v1 y mapeo

Parser backend puro independiente de la librería visual, con versión invoice-key-value-v1. Texto UTF-8 máximo 16 KiB; LF/CRLF normalizados, líneas vacías ignoradas, trim exterior; cada línea no vacía debe contener clave=valor separando por el primer igual. Nunca concatenar líneas partidas visualmente del ejemplo ni ejecutar URL. Claves sensibles a mayúsculas; rechazar duplicados aun idénticos y claves desconocidas para evitar pérdidas silenciosas. No es un parser fiscal universal.

| Clave | Campo Invoice | Regla |
| --- | --- | --- |
| NumFac | invoiceNumber | Normalización comercial vigente |
| FecFac | invoiceDate | YYYY-MM-DD válido |
| HorFac | invoiceTime / invoiceAtUtc | HH:mm:ss con desplazamiento opcional |
| NitFac | issuerNit | Texto de dígitos según contrato vigente |
| DocAdq | buyerDocument | Texto, nunca ownerSubject |
| ValFac | amount | Decimal exacto |
| ValIva | vatAmount | Decimal exacto, 0 explícito obligatorio |
| ValOtroIm | otherTaxesAmount | Decimal exacto, 0 explícito obligatorio |
| ValTolFac | totalAmount | Suma exacta vigente |
| CUFE | qrMetadata.cufe | Opcional, hexadecimal 96 caracteres; normalizado minúsculas |
| QRCode | qrMetadata.sourceUrl | Opcional HTTPS absoluta, máximo 2048 caracteres, sin credenciales |

Los nueve campos comerciales son obligatorios. HorFac sin offset se interpreta en America/Bogota; si trae offset se admite -05:00 en v1 y se conserva el instante consistente con el modelo actual. Otro offset se rechaza como no soportado: no se cambia fecha/hora silenciosamente ni se elimina el offset. El ejemplo aportado es compatible; no implica cobertura de todos los formatos externos.

Los campos ausentes/vacíos se informan sin permitir edición; valores malformados, negativos, total incoherente, duplicados o formato URL-only bloquean confirmación. Escanear una imagen con texto del QR no equivale a OCR y no se ofrece como entrada textual pública.

### Flujo y API

UI dentro de Facturas: elegir cámara/imagen → decodificar → revisión mediante POST /api/invoices/qr/preview → elegir vehículo/asignación propia → adjunto opcional independiente → confirmar POST /api/invoices/qr. Preview no persiste, requiere Bearer/invoices:create y contexto explícito, responde campos normalizados o errores con nombres de claves sin contenido sensible. No consulta asignación hasta seleccionar para guardar.

Preview recibe JSON estricto {qrContent}. Alta recibe multipart payload {qrContent, vehicleId, assignmentId} y image opcional; Idempotency-Key y scope=organization&thirdPartyId obligatorios. No acepta importe, propietario ni origen suministrados aparte. Alta vuelve a parsear; no confía en campos ni validación previa del cliente. La imagen de decodificación permanece local; solo la elegida como adjunto sigue el normalizador privado existente.

Ambas operaciones limitan tamaño real consumido, no solo Content-Length. Errores 400 QR_INCOMPLETE/QR_INVALID/QR_UNSUPPORTED, 401, 403, 404 neutro de asignación, 409 duplicidad/versión de evidencia, 413 tamaño, 415 adjunto y 503/500 según proveedores. Preview 200, alta 201; no nueva entidad preview ni tokens de prueba fiscal.

### Un único Invoice y autoridad backend

Extender InvoiceOrigin a MANUAL|QR y crear factory QR con valores extraídos y metadatos generados por servidor. Reutilizar coordinación de alta con discriminante interno controlado, repositorio único, asignación concreta, fences y auditoría existentes. Inventario/decode deben admitir ambas variantes; MANUAL no requiere metadatos QR. Frontend/API/OpenAPI deben reconocer ambos orígenes antes de habilitar altas.

Hash SHA-256 del texto UTF-8 con finales de línea normalizados; guardar hash y versión del parser, CUFE/URL opcionales, no payload crudo completo. Son trazabilidad de entrada, no firma ni validación de autenticidad. Mantener clave única tercero/NIT/número y añadir índice único parcial tercero/CUFE solo cuando sea string; no índices que colisionen con MANUAL por null. Hash de idempotencia incluye origen, datos derivados, referencias, procedencia y hash de adjunto. Mismo contenido y clave recupera resultado después de reautorizar; origen distinto nunca equivale a reintento idéntico.

UI muestra datos QR bloqueados y permite solo vehículo/asignación y adjunto independiente antes de guardar. Toda edición posterior de QR devuelve QR_IMMUTABLE tras autorización y lookup aislado, antes de Configuration, evitando confundirla con EDIT_POLICY_UNAVAILABLE o EDIT_WINDOW_CLOSED. No nuevas concesiones; THIRD_PARTY_ADMIN lee según alcance pero no crea ni edita QR.

### Organización y estilos

Extender modules/invoices en ambas apps. Domain contiene restricciones puras; application contiene parser/casos de uso/puertos; infrastructure el decoder visual y persistencia; presentation cámara, diálogos y validación HTTP. Composición en app/bootstrap. La biblioteca no entra en React componentes ni en dominio; el componente usa acciones inyectadas.

Reutilizar theme, Dialog con contenido desplazable y acciones visibles, Stack spacing=2, SuccessNotice y mensajes compartidos. Una columna móvil, pares fecha/hora y número/NIT en escritorio, importes agrupados, total y adjunto a todo ancho. Aviso visible de origen QR y ausencia de validación fiscal. Conservar listado, filtros y tablas actuales con etiqueta de origen. Captura de contexto y AbortSignal invalidan preview/envío al cambiar organización; cancelar libera cámara y previews. Reintentos mantienen clave y borrador solo dentro del contexto vigente.

## Risks / Trade-offs

- [Variantes QR externas] → formato v1 deliberadamente estricto; errores explican rechazo, sin inferencias ni descarga de URL.
- [Origen QR confundido con autenticidad] → texto explícito y revisión autoritativa del contenido, sin afirmar validación fiscal.
- [Clientes MANUAL rechazan QR] → despliegue coordinado y comprobaciones de inventario, DTO y schemas antes de habilitar captura.
- [Permisos/stream quedan abiertos] → pruebas de salida, cambio de contexto, permisos denegados y navegación.
- [Librería envejece] → puerto sustituible y revisión de dependencias en implementación; no afirmar compatibilidad no probada.

## Migration Plan

Inventariar facturas existentes y confirmar que siguen válidas como MANUAL sin backfill de QR. Añadir soporte de lectura y metadatos opcionales primero; crear índice parcial CUFE y probar en base aislada. Habilitar UI y endpoints QR cuando backend/frontend soporten ambos orígenes. Rollback seguro desactiva captura conservando lectores compatibles con QR ya registrados; nunca desplegar lector MANUAL-only sobre datos QR ni borrar facturas para revertir.
