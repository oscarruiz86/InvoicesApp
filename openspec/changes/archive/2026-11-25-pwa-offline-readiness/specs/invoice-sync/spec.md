# Spec Delta

## ADDED Requirements

### Requirement: Preparación offline después de autenticación
Cuando un DRIVER termine de autenticar y tenga un contexto de tercero activo, la aplicación MUST preparar la credencial offline, las asignaciones elegibles y el lector QR sin exigir que abra Facturas.

#### Scenario: Login con un contexto seleccionable
- **WHEN** el conductor completa el login y selecciona un tercero autorizado
- **THEN** la aplicación solicita y verifica la credencial limitada, conserva las asignaciones del contexto y precarga el lector QR en segundo plano

#### Scenario: Login sin contexto válido
- **WHEN** la autenticación termina pero no existe un contexto DRIVER autorizado
- **THEN** la aplicación no solicita credencial offline y deja la captura no disponible con un motivo recuperable

### Requirement: Preparación idempotente y cancelable
La preparación offline MUST ejecutarse una sola vez por combinación de sujeto, tercero y generación de contexto, MUST cancelar solicitudes de una generación anterior y MUST poder reintentarse desde el estado de la aplicación.

#### Scenario: Cambio de tercero durante la preparación
- **WHEN** el conductor cambia de tercero mientras se emite la credencial
- **THEN** se cancela o invalida la preparación anterior y solo se conserva la credencial del nuevo contexto

#### Scenario: Reintento tras error temporal
- **WHEN** falla la preparación por red o por una respuesta temporal
- **THEN** el estado queda como no disponible o reintentable y una nueva conexión permite reintentar sin duplicar credenciales activas

### Requirement: Reapertura offline sin visitar Facturas
Un DRIVER que haya completado la preparación online MUST poder abrir la PWA o recargarla sin conexión y acceder a la captura manual o QR con la credencial y asignaciones conservadas.

#### Scenario: PWA reabierta sin conexión
- **WHEN** el conductor cierra y vuelve a abrir la PWA dentro de la vigencia de la credencial
- **THEN** la aplicación muestra la captura offline disponible sin requerir cargar primero la página Facturas

#### Scenario: Credencial vencida al reabrir
- **WHEN** la PWA se abre sin conexión y la credencial local ya expiró
- **THEN** la aplicación conserva la cola existente, bloquea nuevas capturas y solicita reconexión para reautenticarse

### Requirement: Sincronización al recuperar actividad
La cola offline MUST iniciar su sincronización al recuperar conexión, al recibir foco o al abrir la PWA, y MUST actualizar los estados visibles sin depender de que el usuario navegue a Facturas.

#### Scenario: Conexión recuperada con cola pendiente
- **WHEN** el navegador pasa a estar online y existe una cola del sujeto activo
- **THEN** se intenta sincronizar con la sesión normal y cada registro conserva su estado definitivo o reintentable

#### Scenario: Reapertura con cola pendiente
- **WHEN** el conductor abre la PWA con conexión después de haberla cerrado
- **THEN** la aplicación detecta la cola local, intenta sincronizarla y conserva los registros no resueltos para consulta posterior

### Requirement: Estado de preparación observable
La interfaz MUST exponer un estado de preparación offline asociado al contexto activo, incluyendo última preparación, expiración, cantidad de asignaciones almacenadas y causa de indisponibilidad, sin exponer la credencial ni identificadores internos.

#### Scenario: Preparación lista
- **WHEN** la credencial y las asignaciones se verifican correctamente
- **THEN** el conductor ve que la captura offline está lista y hasta cuándo es válida

#### Scenario: Preparación degradada
- **WHEN** el almacenamiento, la precarga QR o la emisión de credencial falla
- **THEN** el conductor ve una causa operativa segura y una acción para reintentar con conexión

### Requirement: Vigencia offline de 72 horas
La credencial offline MUST ser emitida y validada con una vigencia máxima de 72 horas; la política efectiva MUST provenir del backend y el cliente MUST rechazar credenciales que excedan ese límite.

#### Scenario: Reapertura dentro de la vigencia
- **WHEN** el conductor abre la PWA sin conexión antes de que transcurran 72 horas desde la emisión
- **THEN** puede capturar usando la credencial firmada y las asignaciones conservadas, sujeto a su expiración exacta

#### Scenario: Reapertura después de 72 horas
- **WHEN** el conductor abre la PWA sin conexión después de la expiración de la credencial
- **THEN** se bloquean nuevas capturas, se conservan pendientes y se solicita reconexión para emitir una credencial nueva

#### Scenario: TTL fuera de la política
- **WHEN** el cliente recibe una credencial con una duración superior a 72 horas o inconsistente con su fecha de expiración
- **THEN** la credencial se rechaza y la captura offline queda no disponible
