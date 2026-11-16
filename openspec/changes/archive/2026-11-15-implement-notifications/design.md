# Design

## Contexto

El backend usa Next.js, TypeScript, MongoDB/Mongoose y transacciones en replica set. La composición de Route Handlers vive en `backend/src/bootstrap`; las dependencias técnicas permanecen en Infrastructure y cada aplicación expone puertos hacia sus consumidores. Docker Compose inicia MongoDB y un servidor API, pero todavía no hay proceso worker.

Organizations ya implementa invitaciones organizacionales. La creación y el reenvío registran eventos durables `INVITATION_CREATED` y `INVITATION_RESENT`; actualmente el caso de uso llama la entrega sincrónicamente y el adaptador de prueba escribe la URL completa con token en logs. Esa entrega de prueba se reemplaza por la nueva notificación y nunca se usará para verificar el worker.

## Metas y no metas

**Metas:** separar intención funcional, política de canal y SMTP; guardar solicitudes e intentos durablemente; enviar fuera del request; reintentar errores temporales de forma acotada; entregar invitaciones sin exponer el token; dejar canales futuros detrás del contrato.

**No metas:** elegir proveedor externo SMTP o gestor productivo de secretos, administrar plantillas desde UI, ofrecer reenvío operativo manual, ni prometer entrega exactamente una vez al servidor externo.

## Decisiones

### 1. Contrato y límites

Notifications ofrece un puerto de aplicación para solicitar una notificación con tipo, canal, destinatario, idioma, variables, referencia funcional e idempotency key. Los productores eligen cuándo solicitarla; no conocen SMTP ni sus credenciales. Notifications controla solicitudes, entregas y renderizado. Infrastructure implementa MongoDB, el worker, plantillas, lectura de secretos y transporte SMTP. Bootstrap conecta los puertos.

### 2. Persistencia y ejecución durable

MongoDB es el almacén de solicitudes y entregas, en colecciones propias de Notifications. La aceptación y disponibilidad para despacho se escriben en una transacción durable. Un proceso Node worker separado del servidor HTTP reclama trabajos atómicamente mediante leases, procesa vencimientos y recupera leases expiradas. El worker usa la misma aplicación/backend y MongoDB existentes; se añade un comando y un servicio de ejecución separados.

Las solicitudes mantienen estado, timestamps, número de intentos, contenido mínimo de entrega, functional reference e idempotency key. Los intentos mantienen estado, fechas y código de resultado normalizado. No se guardan cuerpos renderizados, respuestas SMTP crudas ni destinatarios en logs. La retención definitiva se configura como decisión operativa pendiente; el worker no borrará solicitudes automáticamente hasta aprobarla.

La unicidad de idempotency key es durable por tipo/canal/clave. Repetir una solicitud equivalente devuelve el mismo registro; reutilizar la clave con contenido distinto es conflicto. SMTP puede aceptar un mensaje antes de que la aplicación confirme el resultado; no se promete exactamente una vez fuera del sistema.

### 3. Reintentos

La política aprobada es de cinco intentos totales: primer intento inmediato y, ante fallo temporal, reintentos tras 1, 5, 15 y 60 minutos. Solo errores temporales clasificados se reintentan. Plantillas inválidas, canal deshabilitado, configuración incompleta y errores permanentes son terminales. Un jitter pequeño podrá distribuir carga, sin alterar los límites ni los intervalos máximos.

### 4. SMTP y secretos

SMTP es un transporte configurable por host/puerto, sin seleccionar un proveedor. Los parámetros operativos SMTP se configuran en el `.env` ignorado por Git. Ese archivo incluye la ruta o referencia al secreto, no el valor de contraseña. Un puerto `SecretReader` lee la contraseña desde un archivo montado por el entorno; la implementación permanece neutral respecto al gestor productivo, aún no seleccionado.

La configuración incluye habilitación, host, puerto, usuario, referencia de contraseña, modo TLS, remitente y timeout. `plain` se admite solo en desarrollo local; los demás entornos requieren TLS implícito o STARTTLS. Una configuración habilitada e incompleta falla de forma segura sin intentar conexión. Un canal deshabilitado produce resultado `suppressed`, sin contactar SMTP.

### 5. Plantillas y renderizado

Plantillas estáticas versionadas por tipo e idioma definen asunto, texto plano, HTML opcional y variables requeridas/opcionales. No ejecutan código ni permiten recursos remotos definidos por variables. El renderer rechaza plantilla ausente, variable requerida faltante o variables no declaradas antes de invocar el transporte. Escapa los valores interpolados en HTML y normaliza el asunto/texto como texto plano. No se hace fallback de idioma silencioso.

### 6. Invitaciones como primer productor

El primer tipo funcional es la invitación organizacional, basado en los eventos existentes `INVITATION_CREATED` y `INVITATION_RESENT`. El envío se solicita de forma durable durante la misma operación transaccional que crea o actualiza la invitación, evitando confirmar una invitación sin una solicitud entregable.

El token de aceptación es un secreto de un solo uso. Para permitir entrega asíncrona sin persistirlo en claro, la solicitud guarda solo el payload mínimo cifrado con AES-256-GCM. La clave de cifrado se lee por `SecretReader` desde un archivo montado; el `.env` contiene únicamente su referencia. El payload cifrado se elimina tras entrega terminal y, si la invitación expira o se cancela, se suprime antes del envío. Ningún log o resultado contiene URL, token, destinatario completo ni variables.

El worker publica el resultado terminal mediante un puerto de notificación desacoplado. Bootstrap conecta el handler de Organizations para actualizar el estado de entrega de la invitación sin que Notifications acceda a sus colecciones. La confirmación de este resultado se reintenta independientemente del envío para no mandar el correo otra vez.

Las pruebas usan un doble de transporte que captura únicamente que hubo una llamada; no registran ni imprimen enlaces o tokens. Se elimina el adaptador de prueba que registraba la URL.

### 7. Decisiones pendientes

1. Gestor productivo que montará los secretos SMTP y la clave AES; se implementa el puerto y montaje por archivo sin escoger proveedor.
2. Retención/borrado de solicitudes, intentos y metadatos luego de entrega terminal.
3. Disponibilidad y escalado del worker en el entorno de producción, que no está definido en el repositorio.
4. La primera plantilla de invitación usa español (`es`); idiomas adicionales y sus plantillas quedan para cambios futuros.

## Riesgos

SMTP puede aceptar un correo antes de una caída local y producir duplicado durante recuperación. La clave de cifrado de payload debe estar disponible en todos los workers que procesen la cola y respaldarse según la política operativa. Las variables de invitación deben borrarse en cuanto ya no sean necesarias. El worker no debe arrancar en más de un modo independiente de MongoDB ni usar memoria local como cola.
