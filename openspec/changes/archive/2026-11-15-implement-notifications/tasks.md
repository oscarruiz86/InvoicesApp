# Tasks

- [x] 1.1 Confirmar decisiones de diseño para implementar: MongoDB con worker Node separado; SMTP genérico configurado desde `.env`; password SMTP y clave AES resueltos por `SecretReader` desde archivos montados; cinco intentos totales con esperas de 1, 5, 15 y 60 minutos. El gestor productivo de secretos y la retención automática permanecen pendientes y no se simulan en esta entrega.
- [x] 1.2 Inspeccionar el estado vigente de los módulos funcionales y elegir productor/evento real. Organizations implementa creación y reenvío de invitaciones y registra `INVITATION_CREATED` y `INVITATION_RESENT`; son los primeros tipos de notificación y reemplazan la entrega de prueba por log.
- [x] 2.1 Definir contratos Domain/Application para solicitudes, resultados, canal, destinatario, idioma, variables, referencia funcional, idempotencia, entrega y puertos de estado; mantenerlos independientes de MongoDB y SMTP.
- [x] 2.2 Definir estados y transiciones para solicitud, intento, supresión, procesamiento con lease, reintento y terminales; actualizar el contrato de estado de entrega de invitaciones para el flujo asíncrono.
- [x] 2.3 Implementar persistencia MongoDB de solicitudes e intentos con unicidad idempotente, reclamación atómica y recuperación de leases; cifrar el payload mínimo de invitación antes de escribirlo y coordinar solicitud y evento funcional en transacción.
- [x] 3.1 Añadir proceso worker Node independiente del servidor HTTP, comando npm y servicio de desarrollo Compose que comparte configuración y MongoDB sin usar una cola en memoria.
- [x] 3.2 Procesar plantillas y entregas desde el worker; separar el resultado del envío SMTP del reintento de proyección del estado funcional para no reenviar un mensaje tras un fallo de actualización.
- [x] 3.3 Implementar política temporal aprobada de cinco intentos totales y demoras 1/5/15/60 minutos; fallos permanentes y condiciones terminales no se reintentan.
- [x] 4.1 Definir plantillas estáticas en español para invitación creada y reenviada, con asunto, texto, HTML opcional y declaración explícita de variables.
- [x] 4.2 Implementar renderer seguro sin ejecución de código, rechazando variables faltantes/no declaradas y escapando interpolaciones HTML antes del transporte.
- [x] 5.1 Añadir configuración SMTP a `.env` con habilitación, host, puerto, usuario, referencia a password montado, TLS, remitente y timeout; resolver password y clave de payload vía `SecretReader`.
- [x] 5.2 Rechazar configuración incompleta y modo sin TLS fuera de desarrollo local; representar canal deshabilitado sin conexión ni reintentos.
- [x] 5.3 Normalizar resultados SMTP y asegurar que logs, errores y resultados excluyan secretos, token/enlace, cuerpos, variables y destinatarios completos.
- [x] 6.1 Encolar notificaciones de invitación creada/reenviada coordinadas con la escritura funcional; cifrar el token de un solo uso y suprimir/borrar el payload al expirar, cancelarse o completar la entrega.
- [x] 6.2 Eliminar el adaptador de prueba que escribía enlaces de invitación en logs; adaptar la proyección durable del resultado SMTP al estado de entrega de Organizations sin acceso entre colecciones ajenas.
- [x] 6.3 Documentar configuración `.env`, montaje de secretos, ejecución del worker, límites de idempotencia/reintentos y las decisiones de proveedor productivo/retención que siguen abiertas.
