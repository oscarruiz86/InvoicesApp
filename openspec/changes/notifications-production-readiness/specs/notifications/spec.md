# Notifications

## MODIFIED Requirements

### Requirement: Persistencia durable de solicitudes y entregas

El sistema MUST persistir solicitudes y entregas con estados, intentos, fechas y resultados técnicos normalizados. La aceptación MUST garantizar disponibilidad durable para procesamiento. Deben conservarse solo datos necesarios y aplicarse la política aprobada de retención a solicitudes terminales, intentos y metadatos. Los trabajos activos y proyecciones pendientes se conservan hasta resolverse. Los registros terminales y sus claves de idempotencia MUST conservarse 90 días desde la fecha terminal y luego eliminarse. El destinatario, las referencias funcionales y el historial de intentos se conservan dentro de ese mismo plazo; el payload cifrado con el token se elimina al alcanzar estado terminal.

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

#### Scenario: Solicitud terminal fuera de retención

- **WHEN** una solicitud terminal supera su plazo aprobado de retención
- **THEN** el proceso elimina o anonimiza los datos designados
- **AND** conserva únicamente los registros y métricas requeridos por la política

#### Scenario: Trabajo todavía activo

- **WHEN** una solicitud sigue pendiente, en procesamiento, en reintento o con proyección pendiente
- **THEN** la retención no elimina los datos necesarios para enviarla o recuperar su estado

### Requirement: Procesamiento asíncrono, idempotente y acotado

El envío MUST ocurrir fuera del request funcional mediante un worker separado y durable. El sistema MUST prevenir duplicados con una clave idempotente única por tipo y canal mientras el registro exista; tras 90 días terminales, el registro y su clave se eliminan y una repetición posterior puede crear una solicitud nueva. Realiza como máximo cinco intentos y reintenta solo fallos temporales tras 1, 5, 15 y 60 minutos. No promete entrega exactamente una vez a SMTP. En producción, el worker se despliega independientemente de la API y define salud, apagado ordenado, recuperación de leases, escalado y progreso. Se alertan falta de progreso y fallos terminales sin exponer datos sensibles.

#### Scenario: Repetición equivalente

- **WHEN** se recibe de nuevo la misma clave idempotente con contenido equivalente
- **THEN** se reutiliza la solicitud existente y no se crea otro envío inicial

#### Scenario: Misma clave con contenido distinto

- **WHEN** se recibe una clave ya usada con datos incompatibles
- **THEN** se rechaza la solicitud con un conflicto tipado
- **AND** se conserva la solicitud original

#### Scenario: Fallo temporal dentro del límite

- **WHEN** un intento falla por una condición temporal clasificada y quedan intentos
- **THEN** se programa un nuevo intento durable según la espera aprobada
- **AND** no se superan cinco intentos totales

#### Scenario: Fallo permanente o límite agotado

- **WHEN** ocurre un fallo permanente o se agotan los intentos
- **THEN** la solicitud termina con resultado normalizado
- **AND** no se reintenta automáticamente

#### Scenario: Reinicio durante un envío en producción

- **WHEN** una instancia del worker termina durante el procesamiento
- **THEN** otra instancia recupera el trabajo mediante el lease durable
- **AND** los registros identifican el fallo solo mediante códigos e identificadores técnicos

#### Scenario: Worker sin progreso

- **WHEN** el worker deja de procesar trabajos o supera los límites aprobados de fallos
- **THEN** la monitorización genera una alerta accionable para el responsable operativo

### Requirement: Entrega SMTP configurable y secretos externos

El sistema MUST enviar correo con SMTP configurable, incluyendo habilitación, host, puerto, usuario, referencia al secreto, TLS, remitente y timeout. El archivo .env ignorado por Git contiene solo configuración no secreta y referencias. SecretReader lee la contraseña SMTP y la clave AES desde archivos montados. Fuera del desarrollo local se exige TLS. En producción se usa el mecanismo aprobado de archivos montados de solo lectura, con permisos mínimos del host y del usuario no privilegiado del contenedor. El host gestiona identidad, auditoría y disponibilidad de esos archivos. Se documentan rotación, versionado, revocación y recuperación; las claves necesarias para trabajos activos permanecen disponibles.

#### Scenario: Canal habilitado y configuración válida

- **WHEN** correo está habilitado y la configuración SMTP y el secreto están disponibles
- **THEN** el adaptador envía mediante el host y modo TLS configurados

#### Scenario: Canal deshabilitado

- **WHEN** se solicita correo mientras el canal está deshabilitado
- **THEN** se conserva el resultado suppressed
- **AND** no hay conexión SMTP ni reintentos

#### Scenario: Configuración incompleta

- **WHEN** falta una configuración obligatoria o un secreto requerido
- **THEN** se termina con error tipado sin exponer valores
- **AND** no se intenta conectar con configuración parcial

#### Scenario: Transporte no seguro fuera de desarrollo

- **WHEN** TLS está desactivado fuera del desarrollo local
- **THEN** la configuración se rechaza antes de enviar

#### Scenario: Secreto ausente o worker no autorizado

- **WHEN** falta un secreto o la identidad del worker carece de permiso
- **THEN** la entrega falla de forma segura sin exponer valores

#### Scenario: Rotación de claves con trabajos pendientes

- **WHEN** se rota una clave de payload con notificaciones aún procesables
- **THEN** el worker conserva acceso a las versiones necesarias o aplica el procedimiento aprobado
- **AND** no registra ni expone claves