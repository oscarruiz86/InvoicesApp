# Captura de facturas desde QR

## Formato aceptado

La versión `invoice-key-value-v1` acepta texto UTF-8 de hasta 16 KiB con una pareja `clave: valor` por línea, como publica el [Anexo Técnico de Factura Electrónica de Venta de DIAN, versión 1.9](https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf), y conserva compatibilidad con `clave=valor`. Se permiten finales LF/CRLF, líneas vacías y espacios exteriores. La URL HTTPS puede venir como campo `QRCode: URL`/`QRCode=URL` o como una línea independiente después de los campos completos. Las claves distinguen mayúsculas y minúsculas; no se concatenan líneas partidas ni se consultan URL. Un QR que contenga solo una URL sigue sin ser suficiente para registrar.

Son obligatorios `NumFac`, `FecFac`, `HorFac`, `NitFac`, `DocAdq`, `ValFac`, `ValIva`, `ValOtroIm` y `ValTolFac`. `CUFE` (96 caracteres hexadecimales) y `QRCode` (URL HTTPS sin credenciales, hasta 2048 caracteres) son opcionales. Los importes se validan como decimales exactos y el total debe coincidir. Una hora sin offset se interpreta en `America/Bogota`; v1 acepta `-05:00` y rechaza otros offsets. Un QR incompleto no habilita completar datos a mano: hay que leer otro código o salir y usar el registro MANUAL independiente.

## Captura y privacidad

La cámara solo se solicita después de pulsar **Abrir cámara**. El navegador necesita un contexto seguro: HTTPS o `localhost` en desarrollo. En redes LAN por HTTP la cámara no está disponible; use HTTPS o **Leer imagen local**. La imagen de lectura se limita a JPEG/PNG, 5 MiB y 20 megapíxeles. La lectura pausa al primer resultado. Antes de crear, Facturas vuelve a validar en servidor, muestra campos no editables y exige elegir una asignación propia y confirmar. La imagen escaneada no se adjunta automáticamente; el adjunto es una selección aparte.

Al cancelar, cerrar o cambiar de contexto se detiene el escáner y se descartan resultados pendientes. Las URL se presentan como texto y nunca se abren. No se envía contenido a servicios externos. El backend guarda la versión del parser, el hash SHA-256 del texto normalizado, CUFE y URL opcionales; no guarda el texto QR completo en factura, logs o auditoría. Estos datos no acreditan autenticidad fiscal.

Las facturas QR se guardan en la colección existente, conservan su origen y referencias históricas, y no admiten cambios posteriores de campos, asignación o imagen. El índice CUFE es único por tercero solo cuando CUFE es una cadena; la clave comercial NIT/número aplica a ambos orígenes. Los endpoints son `POST /api/invoices/qr/preview` (sin escritura) y `POST /api/invoices/qr` (alta idempotente). El alta siempre vuelve a parsear el contenido.

## Dependencia de lectura

Se fija [`qr-scanner@1.4.2`](https://www.npmjs.com/package/qr-scanner) detrás del puerto `QrDecoder`. La dependencia tiene [licencia MIT](https://github.com/nimiq/qr-scanner/blob/master/LICENSE) y soporta cámara, imagen y worker local empaquetado, sin CDN. Su última publicación npm observada es antigua (hace cuatro años a noviembre de 2026), aunque el [repositorio registra actividad reciente en issues](https://github.com/nimiq/qr-scanner/issues); por eso queda encapsulada para permitir reemplazo. El bundle se debe revisar al construir Vite. [`@zxing/browser`](https://www.npmjs.com/package/@zxing/browser) es la alternativa si se requiere cambiar de lector; al momento de la revisión npm publicaba `0.2.1` con MIT, pero añade el conjunto de APIs multi-formato que este flujo no requiere.

El build Vite de esta revisión generó un adaptador diferido de 16.78 kB (5.94 kB gzip) y el worker local de 43.95 kB (10.37 kB gzip). El chunk principal fue de 1,035.24 kB (297.78 kB gzip), por encima del aviso predeterminado de 500 kB; la compilación terminó correctamente. La auditoría npm de esta revisión no reportó vulnerabilidades para `qr-scanner`; sí reportó nueve moderadas en herramientas de desarrollo preexistentes de ESLint, minimatch y TypeScript-ESLint. No se aplicaron actualizaciones ajenas al alcance.

En desarrollo con Compose, `frontend-modules` es un volumen persistente y puede conservar dependencias de una versión anterior del lockfile incluso después de reconstruir la imagen. El entrypoint de desarrollo compara el SHA-256 de `package-lock.json` con la instalación montada y ejecuta `npm ci` cuando difieren; esto evita que Vite falle al resolver una dependencia recién incorporada como `qr-scanner`.

## Despliegue y reversión

Antes de habilitar la captura, despliegue juntos los lectores de facturas que aceptan `MANUAL|QR`, el índice parcial CUFE y los DTO/OpenAPI actualizados. Ejecute `npm --prefix backend run invoices:inventory` y resuelva cualquier registro incompatible antes de crear índices. El comando no modifica datos. Puede desactivar la captura para revertir la interfaz, pero mantenga el lector compatible con facturas QR ya guardadas; no las elimine ni despliegue código que las trate como MANUAL.

## Evidencia de cámara

Las pruebas E2E con la cámara simulada verifican revisión, autorización de asignación, confirmación y tamaños móviles/escritorio. Esas pruebas no acreditan acceso a una cámara física. La aceptación final también requiere probar con un dispositivo real en HTTPS, con permiso concedido y denegado, e identificar navegador y dispositivo en `docs/verification.md`.
