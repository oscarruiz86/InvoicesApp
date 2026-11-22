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
