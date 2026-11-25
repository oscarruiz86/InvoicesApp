# Design

## Context

See proposal.md - Why. `invoice-management` actualmente valida y confirma cada alta en línea, exige una asignación ACTIVE al momento de confirmar, usa clave idempotente por actor y tercero, y almacena imágenes fuera de MongoDB. El frontend no incluye caché del shell ni persistencia offline. Las asignaciones conservan `startedAt` y `endedAt`, por lo que se puede referenciar su historial sin reabrirla.

## Goals / Non-Goals

**Goals:**
- Conservar capturas e imágenes en el dispositivo y recuperarlas después de recargar la aplicación.
- Diferenciar captura local, envío, sincronización, error temporal, conflicto y resolución.
- Evitar facturas duplicadas con una identidad local estable y reintentos idempotentes.
- Mantener autorización y validación del servidor como autoridad; limitar decisiones de conflicto al `THIRD_PARTY_ADMIN` del tercero.
- Auditar excepciones y resoluciones sin incluir imagen ni contenido sensible completo.
- Garantizar que la captura manual y QR pueda abrirse sin red después de una preparación previa con conexión.
- Permitir continuar la captura tras recargar la aplicación sin red mediante una credencial offline firmada, de alcance y vigencia limitados.
- Dar al conductor un historial del servidor, propio y paginado, para consultar envíos rechazados, resueltos y aceptados después de dejar la cola local.
- Marcar en la lista de facturas registradas el canal OFFLINE, sin inferirlo a partir del origen MANUAL o QR.

**Non-Goals:**
- Sincronizar facturas manuales y QR mediante la misma cola, conservando la validación QR autoritativa del servidor.
- Habilitar la creación o edición general de facturas por el administrador.
- Cambiar el modelo de almacenamiento de imágenes o la edición de facturas ya confirmadas.
- Tratar la hora del dispositivo como prueba suficiente para autorizar una factura.
- Admitir el inicio de sesión por primera vez sin conexión.
- Usar la credencial offline como token de acceso a API o como reemplazo del inicio de sesión normal.

## Decisions

1. **Shell offline y captura local duradera.** Instalar un service worker que almacene el shell versionado, el lector QR y recursos estáticos necesarios para abrir la captura; no almacena respuestas privadas de API. Si la conexión cae mientras la aplicación está abierta, sustituye la vista protegida y sus errores de API/permisos por captura offline, usando la credencial y asignaciones previamente preparadas. Un fallo de renovación causado por desconexión no se considera expiración de sesión ni elimina la cola local. Al recuperar conexión se recarga la aplicación autenticada para renovar permisos y sincronizar. IndexedDB guarda origen, campos MANUAL o contenido QR original, imagen Blob opcional para QR, tercero, asignación, clave idempotente, sujeto, contexto y estado antes de mostrar éxito de captura. Para abrir la captura tras una recarga offline, el cliente verifica una credencial offline firmada que obtuvo tras autenticarse en línea. La credencial identifica al DRIVER, tercero, asignaciones disponibles, alcance exclusivo de captura local y expiración. IndexedDB conserva esa credencial separada de la cola; no se guardan tokens de acceso o renovación. La cola queda asociada al sujeto y contexto; una captura nunca se presenta como factura registrada.

2. **Reintento, transición y clasificación explícitos.** Al iniciar, recuperar conectividad o volver a primer plano, el cliente intenta enviar `PENDING` y `RETRYABLE_FAILURE`; ofrece reintento manual. `online` es solo señal. Una clave idempotente y un identificador de envío estable acompañan cada intento. El cliente conserva una captura en la cola de trabajo mientras requiera envío, corrección o revisión. Al recibir un resultado terminal la quita de esa cola; el historial remoto pasa a ser la fuente durable para `SYNCHRONIZED`, `LINKED`, `REJECTED` y conflictos resueltos. Un resultado corregible mantiene un borrador para corregir y presentar con una identidad nueva. No depende exclusivamente de Background Sync.

3. **Registro de sincronización y staging de imagen separados de Invoice.** Añadir un agregado de envío con ID estable, propietario, tercero, origen, contenido MANUAL o QR original, causas de conflicto, clave idempotente, estado, versión y resultado. El servidor es el único que interpreta QR y conserva parser, hash, CUFE y URL solo después de una interpretación válida. Una imagen validada se guarda bajo una clave temporal derivada del envío, nunca como binario MongoDB ni con la clave definitiva de Invoice. Al confirmar una factura se copia al almacenamiento definitivo de Invoice y luego se elimina el staging. Las referencias pendientes de borrado quedan en una cola durable; un worker reintenta hasta completar la eliminación. Los estados corregibles y conflictos vencen a los 30 días; se rechazan y se elimina su staging.

4. **El servidor es autoridad y clasifica el resultado.** El tiempo cliente se conserva solo como dato declarado y no sustituye `createdAt` ni autorización. El backend consulta la asignación histórica y aplica el parser QR vigente al sincronizar. Fallos de red son reintentables; campos, imágenes o QR corregibles requieren nueva presentación; autorización o tercero inactivo son rechazos; duplicidad comercial y asignación cerrada son conflictos. Si existen ambas causas, el envío las conserva. La excepción no reabre la asignación ni trata la hora del dispositivo como evidencia suficiente.

5. **Resolución tipada y creación excepcional separada.** Una duplicidad permite vincular el envío a la factura existente o rechazarlo. Una asignación cerrada permite aprobar excepcionalmente la factura o rechazarla; la aprobación exige versión, motivo, factura, imagen e historial de asignación. La operación administrativa es distinta del alta del conductor: crea una factura cuyo propietario e idempotencia siguen siendo del DRIVER, registra al administrador como decisor y revalida tercero, unicidad, estado y auditoría en una transacción. No acepta cambios libres de datos comerciales. Si existen causas múltiples, una acción debe resolverlas todas.

6. **Estados presentados desde la fuente correcta.** El conductor ve `PENDING`, `SENDING`, `RETRYABLE_FAILURE`, `REQUIRES_CORRECTION`, `CONFLICT`, `SYNCHRONIZED`, `LINKED` o `REJECTED`. `SYNCHRONIZED`, `LINKED` y `REJECTED` son terminales y no se reenvían ni aparecen en la cola de trabajo. La cola local también deja de mostrar un conflicto cuando el servidor confirma que quedó resuelto. Un historial paginado del servidor, filtrado por sujeto autenticado y tercero, conserva todos los envíos conocidos por el servidor y muestra fecha, resumen de factura, estado, causa, motivo y resultado de una decisión administrativa. La bandeja de administración consulta solo conflictos vigentes del tercero autorizado y muestra datos mínimos de comparación. El resultado se recupera al sincronizar o actualizar la vista; no requiere notificación push.

7. **Privacidad y ciclo de vida local.** No almacenar tokens en la cola ni incluir imágenes en logs. La cola se restringe a origen, sujeto y contexto autenticado. Cerrar sesión, expirar la sesión o cambiar de sujeto advierte y elimina capturas sin resultado de servidor, incluidas sus imágenes. Los terminales conocidos por el servidor se consultan desde el historial y se eliminan de la cola local. Un resultado rechazado localmente antes de crear un envío en el servidor puede permanecer en un historial local separado, identificado como disponible solo en el dispositivo y nunca como pendiente de sincronización. La eliminación del navegador puede perder capturas aún no recibidas por el servidor, por lo que la UI no promete respaldo remoto. El límite local de imagen respeta el máximo actual.

9. **Canal de captura en las facturas confirmadas.** Las facturas nuevas persisten `captureChannel` como `ONLINE` u `OFFLINE`; las creadas desde una presentación offline guardan `OFFLINE`, y las altas ordinarias guardan `ONLINE`. Para documentos históricos sin el campo, el mapper y la respuesta los interpretan como `ONLINE`. La tabla de facturas muestra una etiqueta Offline cuando corresponda, independientemente de si el origen comercial fue MANUAL o QR.

10. **Historial de envíos propio.** La API ofrece listado paginado con orden estable, limitado siempre al sujeto autenticado y al tercero solicitado. El resumen incluye campos de factura interpretados de forma segura, fechas del servidor, causas y, cuando exista decisión, acción, fecha, motivo y referencia de factura resultante. No expone imágenes, contenido QR completo ni identificadores internos del administrador. El endpoint consulta eventos de auditoría para enriquecer las resoluciones y no modifica la auditoría original.

11. **Bandeja de conflictos contextual.** La pantalla principal no muestra un bloque vacío cuando no hay conflictos pendientes. Si la cuenta puede administrarlos y el total es mayor que cero, muestra un botón resumen; la comparación, imagen y acciones de resolución se presentan dentro de un modal con paginación.

12. **Cola offline separada e historial administrativo legible.** La captura offline se mantiene en su propia pestaña y la pestaña `Pendientes (n)` aparece solo mientras haya registros que requieran envío, corrección o revisión. La cola conserva su paginación y sus tarjetas móviles. El historial del administrador enriquece las filas con el nombre guardado en la asignación histórica y la placa del vehículo del tercero activo; no serializa el `subject` del conductor.

8. **Credencial offline de captura, firmada y acotada.** Tras autenticación online, el servidor emite una credencial JWS firmada asimétricamente (ES256), con `kid`, `sub`, `thirdPartyId`, `assignmentIds`, alcance único `invoice:offline-capture`, `iat`, `exp` y `jti`; su vigencia máxima es 8 horas y el servidor puede configurarla a un plazo menor. El frontend verifica firma, algoritmo, emisor, expiración y coincidencia de sujeto/tercero contra un JWKS público confiable antes de habilitar captura. La credencial nunca se acepta como bearer en endpoints: la sincronización y consulta requieren autenticación online normal. Al vencer, se bloquean nuevas capturas offline pero se conservan envíos pendientes hasta que el conductor se autentique de nuevo; el ticket se elimina al cerrar sesión o cambiar sujeto. Para rotar, se compila primero un JWKS con claves anterior y nueva, luego el servidor cambia la firma al nuevo `kid` y la clave antigua se conserva en el JWKS al menos 8 horas después de dejar de emitir tickets.

## Risks / Trade-offs

- [El navegador puede limpiar IndexedDB o el usuario puede perder el dispositivo antes de sincronizar] → mostrar número de pendientes, errores de almacenamiento y estado local explícito; mantener el elemento hasta el resultado de servidor.
- [Un reloj manipulado puede alegar que una asignación estaba activa] → la hora cliente no autoriza ni prueba la captura; la excepción requiere revisión de factura, imagen, historial, motivo y auditoría.
- [Un adjunto temporal puede quedar huérfano] → asociarlo al envío, compensarlo ante fallo y eliminarlo al resultado terminal o tras 30 días de conflicto.
- [Una aprobación excepcional puede introducir duplicidad o datos incorrectos] → conservar unicidad por tercero, exigir revisión y motivo, aplicar control de versión y auditar el actor y resultado.
- [La captura local contiene información personal y tributaria] → no sincronizar datos entre usuarios del dispositivo, no guardar credenciales, limpiar registros terminales y no exponer el contenido en telemetría.
- [Los reintentos simultáneos pueden competir por el mismo envío] → identidad estable, idempotencia, estados versionados e índices únicos en servidor.
- [Una credencial copiada puede habilitar captura local hasta su vencimiento] → limitar alcance a captura local, tercero y asignaciones del conductor; fijar vigencia máxima de 8 horas, no permitir llamadas a API con ella y validar nuevamente cada envío con autenticación normal.

## Migration Plan

1. Desplegar emisión/verificación de credenciales offline, persistencia y endpoints de sincronización/conflictos de forma compatible; las rutas actuales de alta y consulta continúan funcionando.
2. Publicar frontend con shell offline, cola local y sincronización para nuevas capturas manuales y QR.
3. Habilitar la bandeja de conflictos para `THIRD_PARTY_ADMIN` y auditar decisiones.
4. No requiere migración de facturas existentes. Para rollback, deshabilitar la captura offline y permitir que el cliente conserve y reintente la cola con la versión compatible; no borrar envíos pendientes ni conflictos del servidor.
