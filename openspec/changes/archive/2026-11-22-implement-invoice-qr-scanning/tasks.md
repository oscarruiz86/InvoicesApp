# Tasks

## 1. Parser y dominio

- [x] 1.1 Implementar parser puro v1, mapeo y errores sin depender de HTTP/decoder; verificar fixtures completos, ausentes/vacíos, duplicados, desconocidos, CRLF, texto partido, límites, URL-only y valores inválidos. Seguimiento: aceptar delimitador DIAN `:` y URL HTTPS independiente con campos completos; conservar compatibilidad `=` y validar importes por separado sin exigir suma simple a ValTolFac.
- [x] 1.2 Extender Invoice a MANUAL|QR con procedencia mínima y factory QR; verificar importes exactos, hora con/sin offset, offset no soportado, CUFE/URL opcionales y conservación del origen en pruebas de dominio. Seguimiento DIAN: la factory QR conserva ValTolFac aunque difiera de la suma simple; MANUAL mantiene su invariante.
- [x] 1.3 Añadir QR_IMMUTABLE y evaluación de edición antes de Configuration tras autorización; verificar todos los roles, cambio de imagen y regresión de edición MANUAL; actualizar documentación de permisos.

## 2. Aplicación y persistencia

- [x] 2.1 Incorporar preview sin escritura y alta QR con parsing autoritativo en los casos de uso existentes; probar revalidación, propiedades manipuladas y asignación propia concreta muchos a muchos con revocación/cierre concurrentes.
- [x] 2.2 Ampliar decode e inventario para coexistencia de orígenes y crear índice parcial CUFE por tercero; verificar MANUAL sin metadatos, duplicado CUFE, duplicado NIT/número entre orígenes y reporte de datos incompatibles; documentar despliegue y rollback compatible.
- [x] 2.3 Ampliar idempotencia y auditoría atómica; probar reintentos, diferencias de origen/contenido/adjunto y fallo de evento sin factura parcial; verificar que logs/eventos no incluyan payload completo ni documentos.

## 3. HTTP y OpenAPI

- [x] 3.1 Añadir handlers preview y alta QR con cuerpos estrictos, tamaño real limitado y errores documentados; verificar contrato HTTP, autenticación, aislamiento, multipart e imagen opcional sin navegación de URL.
- [x] 3.2 Actualizar OpenAPI 3.1, DTO y schemas frontend con ambos orígenes, metadatos seguros y editability QR_IMMUTABLE; comprobar openapi:lint y pruebas contractuales con MANUAL y QR.

## 4. Captura visual y experiencia

- [x] 4.1 Verificar versión, actividad, licencia, vulnerabilidades y compatibilidad del candidato qr-scanner; fijar dependencia y worker local detrás de puerto, medir bundle y probar build Vite sin CDN; registrar decisión y alternativa ZXing.
- [x] 4.2 Implementar adaptador de cámara/imagen con límites y pausa tras un resultado; probar permiso denegado, sin cámara, imagen inválida, lecturas sucesivas, varios códigos y liberación de tracks/worker/object URLs.
- [x] 4.3 Incorporar captura, preview bloqueado, selección propia y confirmación en Facturas con componentes compartidos; verificar rechazo de QR incompleto sin campos manuales, imagen de captura separada de adjunto y ausencia de navegación automática.
- [x] 4.4 Integrar estados normalizados, prevención de doble envío, cancelación y contexto; probar respuestas obsoletas, error/reintento idempotente, cancelación, foco/teclado y 360/1280 px; documentar comportamiento de cámara HTTPS y alternativa local.

## 5. Verificación integral

- [x] 5.1 Ejecutar checks/builds backend y frontend, OpenAPI y pruebas de integración Mongo; registrar evidencia de captura válida a factura QR, duplicidad entre orígenes, rechazo de edición y regresión MANUAL.
- [x] 5.2 Ejecutar E2E con cámara simulada/fixtures; registrar navegador/dispositivo y límites sin atribuir a simulación evidencia de cámara real. Evidencia previa: 4/4 pruebas Playwright en `docs/verification.md`.
- [ ] 5.3 Comprobar dispositivos reales en HTTPS con permiso concedido/denegado; registrar navegador/dispositivo y límites. Requiere acceso físico a los dispositivos.

## Comandos previstos

```text
openspec validate implement-invoice-qr-scanning --strict
npm --prefix backend run check
npm --prefix backend run test:integration
npm --prefix backend run openapi:lint
npm --prefix backend run build
npm --prefix frontend run check
npm --prefix frontend run build
npm --prefix frontend run test:e2e
npm --prefix backend run dev
npm --prefix frontend run dev
```

Integración usa replica set de prueba aislado y configuración documentada. Cámara en IP de LAN exige acceso HTTPS compatible; no se modifica infraestructura durante esta propuesta.

## Workflow follow-up

- Revisar propuesta y aprobar antes de aplicar.
- Implementar en rama exclusiva openspec/implement-invoice-qr-scanning desde development y entregar mediante PR.
- Archivar después de verificar alcance y evidencia, conservando lectores compatibles con QR para rollback.
