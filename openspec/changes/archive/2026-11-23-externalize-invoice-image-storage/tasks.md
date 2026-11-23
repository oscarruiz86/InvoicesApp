# Tasks

## 1. Configuración y contratos

- [x] 1.1 Añadir `INVOICE_IMAGE_STORAGE_PROVIDER`, `INVOICE_IMAGE_STORAGE_LOCAL_ROOT` e `INVOICE_IMAGE_STORAGE_COMPANY_ID` al entorno tipado, con dependencias condicionales y sin E/S durante parseo; verificar casos válidos, ausentes, relativos, desconocidos y valores no expuestos en `backend/tests/unit/environment.test.ts`.
- [x] 1.2 Separar en los puertos de Invoice la referencia externa del contenido y definir el contrato de preparación, activación, lectura, compensación y retiro del storage; verificar con typecheck y dobles de puerto en pruebas de aplicación.
- [x] 1.3 Incorporar la factory cerrada de proveedores en `invoice-endpoint`, soportando solo `local` y sin fallback; verificar que configuración incompleta produzca `CONFIGURATION_ERROR` y que build/OpenAPI no accedan al filesystem.

## 2. Adaptador local seguro

- [x] 2.1 Implementar el constructor de clave `<empresa>/<tercero>/<vehiculo>/<factura>/imagen.<ext>` con identificadores internos y extensión derivada del MIME; verificar en pruebas unitarias PNG/JPEG, separadores, traversal, rutas absolutas y diferencias Windows/Linux.
- [x] 2.2 Implementar preparación, escritura temporal, `fsync`, activación por rename, permisos mínimos y lectura verificada por tamaño/hash dentro de la raíz; verificar con directorios temporales que no se acepten symlinks, archivos no regulares, contenido alterado ni salidas de la raíz.
- [x] 2.3 Implementar reemplazo con backup para el mismo formato y convivencia temporal cuando cambia la extensión, además de compensación idempotente; verificar mediante fallos inyectados que la imagen anterior se restaura o conserva en cada punto previo a la confirmación.
- [x] 2.4 Implementar journal técnico y recuperación de temporales/backups producidos por operaciones nuevas; verificar estados simulados de crash y que la recuperación no retire objetos confirmados.

## 3. Persistencia y casos de uso de factura

- [x] 3.1 Sustituir el documento binario de `invoice_images` por el esquema estricto de referencia externa versionada, sin `data` ni variante legada; verificar que nuevas escrituras no contengan binario y que documentos con el esquema anterior fallen de manera neutra.
- [x] 3.2 Cambiar la lectura para autorizar la factura, cargar su referencia y delegar los bytes al storage sin fallback a MongoDB; verificar autorización, hash discrepante, objeto ausente y 404 neutro en pruebas unitarias y de presentación.
- [x] 3.3 Orquestar el alta manual y QR como saga objeto-primero, limpiando candidatos cuando MongoDB/auditoría falla o una repetición idempotente devuelve otra factura; verificar que no queden referencias rotas y que los reintentos conserven la semántica actual.
- [x] 3.4 Orquestar reemplazos con versión, política y autorización existentes, confirmación transaccional de metadatos y retiro posterior de la versión anterior; verificar fallos antes/después de commit, cambio PNG/JPEG, conflicto de versión y restricciones DRIVER/THIRD_PARTY_ADMIN.
- [x] 3.5 Mantener multipart, `imageUrl`, tipos de respuesta, límite de 5 MiB y cabeceras privadas sin exponer proveedor o clave; verificar las pruebas HTTP/OpenAPI existentes y añadir casos de indisponibilidad de storage.

## 4. Entorno local y operación

- [x] 4.1 Añadir a `compose.yaml` un volumen nombrado montado solo en backend y las variables del proveedor local; actualizar `.env.example` y exclusiones locales, y verificar `docker compose config` y que frontend/workers no monten la raíz.
- [x] 4.2 Documentar en README ejecución host/Compose, namespace técnico, permisos, capacidad, validación de carga/descarga, recuperación de journals y limitación de una sola instancia/volumen; verificar que los comandos documentados correspondan a scripts reales.
- [x] 4.3 Documentar que los datos actuales de facturas/imágenes de desarrollo deben limpiarse o recrearse antes de habilitar el nuevo esquema y que no existe migración ni compatibilidad legada; verificar un arranque limpio sin automatizar borrados sobre bases existentes.
- [x] 4.4 Documentar respaldo/restauración coordinados para entornos de desarrollo que se quieran conservar; verificar el procedimiento con datos creados únicamente bajo el nuevo esquema.

## 5. Verificación integrada

- [x] 5.1 Ejecutar el flujo integrado de alta manual, alta QR con adjunto, lectura autorizada, rechazo ajeno, reemplazo, reinicio y recuperación de compensación con MongoDB limpio y storage temporal; verificar que MongoDB no contenga binarios.
- [x] 5.2 Ejecutar `npm --prefix backend run check`, las pruebas de integración de facturas y `npm --prefix backend run openapi:lint`; corregir cualquier regresión antes de considerar implementada la propuesta.
- [x] 5.3 Ejecutar `openspec validate externalize-invoice-image-storage --strict` y revisar que propuesta, specs, diseño y tareas sigan coherentes con la implementación entregada.

## Workflow follow-up

- Abrir el pull request de `openspec/externalize-invoice-image-storage` hacia `development` y completar la revisión requerida.
- Archivar la propuesta solo después de aprobación y validación del flujo sobre datos de desarrollo recreados con el nuevo esquema.
