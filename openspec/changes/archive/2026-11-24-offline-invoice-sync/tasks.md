# Tasks

## 1. Modelo de envíos, estados y adjuntos temporales

- [x] 1.1 Crear dominio, puertos y repositorio para envíos MANUAL y QR con origen, estados, causas múltiples, versión, identidad idempotente e índices únicos; verificar transiciones terminales, concurrencia e idempotencia con pruebas unitarias y de repositorio.
- [x] 1.2 Implementar staging de imagen normalizada por envío, promoción a la clave definitiva y compensación; verificar que no se guarda binario en MongoDB y que se eliminan adjuntos al resultado terminal o vencimiento.
- [x] 1.3 Implementar recepción autenticada, análisis QR en servidor, consulta de estado y clasificación entre reintento, corrección, rechazo y conflicto; verificar QR inválido, CUFE duplicado, asignación cerrada, causas simultáneas, permisos y respuestas inciertas.
- [x] 1.4 Conectar envíos elegibles con la creación normal, guardando factura, imagen, estado y auditoría sin estados parciales; verificar rollback y una sola factura por reintento.
- [x] 1.5 Documentar endpoints, cuerpos, estados, expiración y errores de sincronización en OpenAPI 3.1; verificar que el contrato describe las respuestas probadas.
- [x] 1.6 Emitir credencial offline JWS firmada (ES256) tras autenticación online, acotada a sujeto, tercero, asignaciones, alcance `invoice:offline-capture` y vigencia máxima de 8 horas; documentar emisión/rotación de claves y probar rechazo de credenciales alteradas, vencidas o presentadas como bearer de API.
- [x] 1.7 Normalizar la hora de factura a `HH:mm:ss` en formularios manuales y devolver errores seguros con el campo específico en captura en línea y sincronización offline; probar alta, edición y validación diferenciada para QR.

## 2. Revisión y resolución administrativa

- [x] 2.1 Implementar bandeja paginada de conflictos aislada por tercero para `THIRD_PARTY_ADMIN`; verificar denegación a DRIVER y aislamiento de terceros en pruebas de autorización.
- [x] 2.2 Implementar resolución versionada: vincular duplicado o rechazarlo; aprobar excepcionalmente asignación cerrada o rechazarla con motivo e historial; verificar causas múltiples, unicidad, propiedad del DRIVER, referencia histórica y conflictos concurrentes.
- [x] 2.3 Registrar auditoría durable de cada decisión con actor, instante, tercero, envío, acción y motivo sin guardar imagen ni contenido completo; verificar reintentos y fallo de auditoría en pruebas.
- [x] 2.4 Permitir al conductor consultar el estado y resultado de sus propios envíos; verificar acceso propio, rechazo a registros ajenos y contrato OpenAPI actualizado.
- [x] 2.5 Implementar listado paginado del historial propio de envíos, con resumen seguro, estado, causas y datos de resultado; aislarlo por sujeto autenticado y tercero.
- [x] 2.6 Enriquecer el historial con acción, fecha y motivo de resolución a partir de auditoría, y documentar el endpoint en OpenAPI; verificar aislamiento, orden y paginación.

## 3. Disponibilidad, captura local y sincronización del frontend

- [x] 3.1 Implementar caché del shell de aplicación y lector QR, y persistir/verificar la credencial offline firmada y el contexto autorizado; permitir captura local solo mientras la credencial sea válida y bloquearla al vencer, sin borrar la cola pendiente. Verificar apertura y escaneo QR sin red, firma/contexto inválidos, vencimiento y reautenticación para sincronizar.
- [x] 3.2 Implementar repositorio IndexedDB para captura manual y QR, contenido QR original, imagen Blob opcional, clave idempotente, sujeto, ámbito y estado local; verificar persistencia, aislamiento y manejo de cuota.
- [x] 3.3 Adaptar los formularios MANUAL y QR para guardar sin conexión usando asignaciones previamente cacheadas y distinguir guardado local de confirmación; verificar captura QR sin validación local de procedencia, contexto ausente y accesibilidad.
- [x] 3.4 Implementar reintentos al iniciar, recuperar conexión y volver a primer plano, además de reintento manual; verificar respuesta incierta, clasificación de errores y nueva identidad tras corrección mediante pruebas.
- [x] 3.5 Mostrar estados `PENDING`, `SENDING`, `RETRYABLE_FAILURE`, `REQUIRES_CORRECTION`, `CONFLICT`, `SYNCHRONIZED`, `LINKED` y `REJECTED`; verificar transiciones y que los terminales no se reenvían.
- [x] 3.6 Advertir y eliminar datos pendientes al cerrar sesión, expirar la sesión o cambiar de sujeto; verificar que las imágenes y registros de otro usuario no se muestran ni sincronizan.
- [x] 3.7 Separar cola de trabajo e historial: retirar registros terminales o gestionados de la cola, conservar los resultados del servidor en el historial y apartar rechazos locales sin servidor; mostrar la cola en tabla paginada.
- [x] 3.8 Crear tabla paginada de historial de sincronización para el conductor con estado, identificación de factura, motivo, resolución administrativa y referencia legible al resultado cuando exista.
- [x] 3.9 Organizar la vista del conductor en pestañas de registradas, pendientes e historial diferido; mostrar detalle pendiente en modal y adaptar tabla/tarjetas a escritorio y móvil.

## 4. Bandeja administrativa e integración

- [x] 4.1 Crear interfaz de administración de conflictos con comparación mínima, motivo y acciones permitidas; verificar flujo duplicado, excepción por asignación cerrada, rechazo y versión obsoleta en pruebas de UI.
- [x] 4.2 Ejecutar los chequeos de integración frontend/backend y revisar contrato, autorización y regresiones del flujo de factura existente; verificar `npm run check` en frontend y los comandos de chequeo equivalentes documentados en backend.
- [x] 4.3 Persistir y exponer el canal `ONLINE`/`OFFLINE` en facturas, tratar documentos antiguos sin campo como `ONLINE` y mostrar distintivo Offline en lista y detalle.
- [x] 4.4 Verificar que la lista de facturas registradas y las nuevas vistas de sincronización conservan paginación accesible y no mezclan registros pendientes con resultados finales.
- [x] 4.5 Mostrar la bandeja administrativa solo cuando existan conflictos y trasladar su comparación y resolución a un modal paginado.
- [x] 4.6 Limitar los avisos, la captura local y la cola offline a usuarios con rol DRIVER; conservar el historial propio del conductor aislado por sujeto.
- [x] 4.7 Habilitar historial paginado para THIRD_PARTY_ADMIN del tercero activo sin exponer el sujeto del conductor; documentar la autorización y verificar aislamiento backend.
- [x] 4.8 Añadir consulta diferida de historial a la barra de facturas del administrador tercero, con retorno a la lista, reintento y estados de error; cubrirlo con pruebas UI.
- [x] 4.9 Ajustar captura offline a pestañas Manual y Código QR, agrupar importes, corregir etiquetas fecha/hora y retirar controles que muestran el texto QR original; probar captura QR y manual.
- [x] 4.10 Unificar presentación y desplazamiento de tablas, mover Capturar factura a la barra antes de filtros y dar mensajes de corrección específicos y seguros; probar mensajes y navegación.
- [x] 4.11 Separar la captura offline y la cola en pestañas, mostrar el contador de pendientes y ocultar la pestaña de cola vacía; probar que el listado paginado aparece solo al seleccionarlo.
- [x] 4.12 Enriquecer el historial del administrador tercero con nombre del conductor y placa del vehículo de la asignación, sin exponer `subject`; verificar contrato, aislamiento y presentación responsive.
