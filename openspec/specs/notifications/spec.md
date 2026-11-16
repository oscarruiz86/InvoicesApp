# notifications Specification

## Purpose
Permitir que módulos funcionales soliciten comunicaciones mediante contratos independientes de canal y transporte, con persistencia durable, renderizado seguro y entrega controlada. El canal inicial es correo electrónico mediante SMTP; el primer productor es el flujo existente de invitaciones organizacionales.

## Requirements

### Requirement: Solicitud funcional desacoplada
El sistema MUST ofrecer un contrato de aplicación común para solicitar una notificación sin depender del canal físico, transporte, framework web o modelo de persistencia. La solicitud MUST identificar tipo, canal, destinatario, idioma, variables, referencia funcional y clave de idempotencia. Las reglas funcionales MUST decidir cuándo corresponde solicitarla y MUST NOT contener lógica SMTP.

#### Scenario: Un módulo solicita notificación
- **WHEN** un caso de uso funcional decide que corresponde comunicar un hecho
- **THEN** solicita la notificación mediante el contrato común con los campos requeridos
- **AND** no conoce configuración, credenciales ni cliente SMTP

#### Scenario: Canal futuro
- **WHEN** se incorpora un canal adicional
- **THEN** puede implementarse detrás del contrato de entrega
- **AND** no requiere mover reglas funcionales al adaptador del canal

### Requirement: Persistencia durable de solicitudes y entregas
El sistema MUST persistir solicitudes y entregas con estados, intentos, fechas y resultados técnicos normalizados. La aceptación de una solicitud MUST garantizar su disponibilidad durable para procesamiento. El sistema MUST conservar solo datos necesarios para entregar y operar.

#### Scenario: Solicitud aceptada
- **WHEN** una solicitud nueva supera validación y deduplicación
- **THEN** se guarda en MongoDB y queda disponible para el worker
- **AND** se registra su fecha de creación y estado inicial

#### Scenario: Intento registrado
- **WHEN** el worker comienza una entrega
- **THEN** queda un intento durable con estado, número y fechas de inicio y finalización
- **AND** su resultado se registra con código normalizado, sin guardar la respuesta SMTP cruda

#### Scenario: Recuperación tras reinicio
- **WHEN** un worker termina durante el procesamiento de una solicitud aceptada
- **THEN** un lease vencido permite recuperar la solicitud desde MongoDB
- **AND** ningún estado de cola depende de memoria local del proceso

### Requirement: Procesamiento asíncrono, idempotente y acotado
El envío MUST ocurrir fuera del request funcional mediante un worker separado y durable. El sistema MUST prevenir solicitudes duplicadas mediante una clave de idempotencia única por tipo y canal. MUST realizar como máximo cinco intentos totales y reintentar únicamente fallos temporales, tras 1, 5, 15 y 60 minutos. No MUST prometer entrega exactamente una vez al servidor SMTP.

#### Scenario: Repetición equivalente
- **WHEN** se recibe de nuevo la misma clave idempotente con contenido equivalente
- **THEN** el sistema reutiliza la solicitud existente y no crea otro envío inicial

#### Scenario: Misma clave con contenido distinto
- **WHEN** se recibe una clave ya usada con datos incompatibles
- **THEN** el sistema rechaza la solicitud con un conflicto tipado
- **AND** conserva la solicitud original

#### Scenario: Fallo temporal dentro del límite
- **WHEN** un intento falla por una condición temporal clasificada y quedan intentos
- **THEN** el sistema programa un nuevo intento durable según la espera aprobada
- **AND** no supera cinco intentos totales

#### Scenario: Fallo permanente o límite agotado
- **WHEN** ocurre un fallo permanente o se agotan los intentos
- **THEN** la solicitud termina con resultado normalizado
- **AND** no se reintenta automáticamente

### Requirement: Plantillas validadas y contenido escapado
El sistema MUST resolver plantillas por tipo e idioma con asunto y texto plano, y HTML opcional. MUST validar variables requeridas y rechazar variables no declaradas antes del transporte. MUST escapar valores interpolados en HTML. Plantillas ausentes o inválidas MUST producir un resultado terminal tipado sin intentar entrega. La primera plantilla de producto MUST usar el idioma español (`es`) y no aplicar fallback silencioso.

#### Scenario: Plantilla completa
- **WHEN** las variables satisfacen el contrato declarado por la plantilla
- **THEN** el renderer genera asunto y texto, y HTML si existe
- **AND** escapa los valores interpolados según el contexto de salida

#### Scenario: Variable requerida ausente o no declarada
- **WHEN** falta una variable requerida o se proporciona una variable que la plantilla no declara
- **THEN** el procesamiento falla como error de plantilla no reintentable
- **AND** no invoca el transporte

#### Scenario: Plantilla de idioma ausente o inválida
- **WHEN** no hay plantilla utilizable para el tipo e idioma solicitados
- **THEN** la solicitud recibe un resultado terminal tipado
- **AND** no intenta SMTP ni cambia silenciosamente el idioma

### Requirement: Entrega SMTP configurable y secretos externos
El sistema MUST enviar correo mediante un adaptador SMTP configurable con habilitación, host, puerto, usuario, referencia al secreto, modo TLS, remitente y timeout. El archivo .env ignorado por Git MUST contener solo configuración no secreta y referencias. La contraseña SMTP y la clave AES MUST leerse mediante SecretReader desde archivos montados. Fuera de desarrollo local MUST exigirse TLS.

#### Scenario: Canal habilitado y configuración válida
- **WHEN** correo está habilitado y la configuración SMTP y el secreto están disponibles
- **THEN** el adaptador envía el mensaje mediante el host configurado y el modo TLS solicitado

#### Scenario: Canal deshabilitado
- **WHEN** se solicita correo mientras el canal está deshabilitado
- **THEN** el sistema conserva el resultado `suppressed`
- **AND** no intenta conectar con SMTP ni programa reintentos

#### Scenario: Configuración incompleta
- **WHEN** el canal está habilitado y falta una configuración obligatoria o el secreto no está disponible
- **THEN** el sistema termina con un error tipado de configuración sin exponer valores
- **AND** no intenta conectarse a SMTP

#### Scenario: Transporte no seguro fuera de desarrollo
- **WHEN** el modo TLS está desactivado en un entorno distinto a desarrollo local
- **THEN** el sistema rechaza la configuración antes de enviar

### Requirement: Logs y resultados seguros
Los logs y resultados MUST excluir secretos, contenido renderizado, variables, enlaces de invitación y datos personales innecesarios. MUST registrar solo identificadores técnicos, transición, duración, número de intento y código normalizado. No MUST persistir respuestas SMTP crudas.

#### Scenario: Fallo SMTP
- **WHEN** SMTP devuelve un fallo temporal, permanente o inesperado
- **THEN** se registra una categoría normalizada apropiada
- **AND** no se registra contraseña, respuesta cruda, cuerpo, destinatario completo ni enlace

#### Scenario: Invitación con token
- **WHEN** una solicitud requiere guardar temporalmente el token secreto del enlace de invitación para entrega asíncrona
- **THEN** el payload se cifra con AES-256-GCM antes de persistirse
- **AND** la clave se lee desde un archivo secreto montado
- **AND** el payload se elimina tras entrega terminal o cuando la invitación ya no es válida

### Requirement: Invitaciones organizacionales como primer productor
Organizations MUST solicitar notificaciones durables para INVITATION_CREATED y INVITATION_RESENT dentro de la transacción de la invitación y sin esperar SMTP. MUST eliminarse la entrega de prueba que escribía enlaces en logs. Los resultados terminales MUST proyectarse mediante un puerto desacoplado; reintentar esa proyección MUST NOT volver a enviar el correo.

#### Scenario: Invitación creada o reenviada
- **WHEN** Organizations crea una invitación o renueva su token para reenvío
- **THEN** persiste una notificación durable con el evento, destinatario mínimo, idioma, referencia funcional e idempotency key
- **AND** el caso de uso no espera el envío SMTP

#### Scenario: Invitación cancelada o expirada antes del envío
- **WHEN** el worker encuentra que una invitación pendiente ya fue cancelada o expiró
- **THEN** suprime la solicitud, elimina el payload cifrado y no contacta SMTP

#### Scenario: Resultado terminal proyectado
- **WHEN** el envío alcanza un estado terminal
- **THEN** el worker actualiza el estado de entrega de la invitación por el puerto acordado
- **AND** un fallo en esa actualización se recupera sin volver a enviar el correo
