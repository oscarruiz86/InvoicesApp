# Proposal

## Why

Invoice Management ya permite registro manual, pero no captura los datos disponibles en un QR. Se necesita reducir la transcripción manteniendo las mismas garantías de propiedad, asignación, duplicidad e historial.

## What Changes

- Capturar QR por cámara o imagen local, con revisión de campos leídos y confirmación explícita.
- Rechazar QR incompletos, inválidos o basados solo en URL; permitir reintentar sin completar campos manualmente dentro del flujo QR.
- Incorporar parsing estricto del formato NumFac/FecFac/HorFac/NitFac/DocAdq/ValFac/ValIva/ValOtroIm/ValTolFac, con CUFE y URL opcionales.
- Ampliar el mismo agregado Invoice con origen QR y metadatos mínimos de procedencia, mediante endpoint específico que revalida el contenido.
- Bloquear toda edición posterior de facturas QR, también imagen y para administradores; conservar el endpoint manual y sus restricciones.
- Reutilizar confirmación transaccional de Flota, idempotencia, clave comercial, auditoría y adjuntos privados de Facturas.
- Excluir consulta DIAN, validación fiscal, OCR, edición de identidad y apertura automática de URLs.

## Capabilities

### New Capabilities

- `invoice-qr-scanning`: Captura visual local, interpretación estricta y revisión de contenido QR de factura.

### Modified Capabilities

- `invoice-management`: Alta QR sobre el modelo existente y protección explícita frente a edición, preservando alta MANUAL.

## Impact

Frontend agrega adaptador de escaneo local y flujo dentro de Facturas; backend amplía domain/application/persistence y OpenAPI. Los consumidores actuales validan origin como literal MANUAL y requieren despliegue coordinado antes de recibir QR. No se crean colecciones paralelas de facturas. Se propone qr-scanner detrás de un puerto sustituible, sujeto a comprobación de versión, licencia y compatibilidad al implementar. La propuesta es documental y no acredita funcionamiento de cámaras ni bibliotecas en este entorno.

## Seguimiento de implementación — 2026-11-22

La captura reportó que Vite no podía resolver `qr-scanner` desde `qr-scanner-adapter.ts`. La dependencia ya estaba fijada en `frontend/package.json` y `frontend/package-lock.json`, y el build local confirmó que el import se resuelve y que el worker se empaqueta localmente. La causa más probable era una instalación obsoleta en el volumen persistente `frontend-modules` de Compose: reconstruir la imagen no refresca un volumen nombrado ya existente.

El contenedor de desarrollo ahora compara el SHA-256 del lockfile con la instalación montada y ejecuta `npm ci` cuando difieren. Así, agregar o actualizar una dependencia sincroniza el volumen antes de iniciar Vite. El cambio no requiere CDN ni altera el bundle de producción.

La verificación simulada cuenta con evidencia previa de 4/4 pruebas Playwright. La aceptación con cámara física sigue pendiente: requiere HTTPS en dispositivo real, comprobar permisos concedidos y denegados, y registrar navegador y dispositivo. La cámara simulada no se considera evidencia de hardware real. El build Vite volvió a pasar; en la sesión de seguimiento Playwright no pudo arrancar porque faltaba el ejecutable Chromium de su caché.

El primer QR real rechazado por preview reveló que el formato implementado inicialmente solo aceptaba `clave=valor`. El anexo técnico DIAN publica los campos como `clave: valor` y el ejemplo añade la URL de consulta como línea independiente. El parser v1 ahora acepta ambos separadores, guarda esa URL solo como metadato cuando los campos obligatorios están completos y mantiene URL-only como formato no soportado. La URL nunca se abre.

El cuerpo de preview aportado después tenía `ValFac=21571.00`, `ValIva=4098.49`, `ValOtroIm=0.00` y `ValTolFac=25670.00`. Se eliminó la regla interna que exigía igualdad aritmética entre esos campos: el anexo DIAN asigna ValFac a `LineExtensionAmount` y ValTolFac a `PayableAmount`, que considera cargos y descuentos. Cada valor se valida individualmente y el backend conserva el total informado sin recalcularlo. Al guardar se detectó que `createQrInvoice` aún delegaba en la fábrica MANUAL, que aplicaba la igualdad; se separó esa validación para mantenerla en MANUAL y permitir el total pagadero DIAN en QR. La regresión cubre ambas rutas.
