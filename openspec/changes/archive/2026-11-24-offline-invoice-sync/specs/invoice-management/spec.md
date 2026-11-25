# Spec Delta

## ADDED Requirements

### Requirement: Presentación diferida de factura capturada offline
Un DRIVER MUST poder conservar localmente una factura MANUAL completa con su imagen o el contenido QR con una imagen opcional y presentarla posteriormente al servidor. La captura local MUST quedar distinguida de una factura confirmada. Al recibirla, el servidor MUST aplicar autorización, asignación, campos, imagen, duplicidad e idempotencia vigentes.

#### Scenario: Captura completa sin conexión
- **WHEN** un DRIVER captura una factura manual válida sin conexión
- **THEN** el dispositivo conserva sus datos e imagen para envío posterior y no la muestra como factura confirmada

#### Scenario: Validación del servidor al sincronizar
- **WHEN** el dispositivo presenta una factura capturada offline al recuperar conexión
- **THEN** el servidor vuelve a validar la solicitud con las reglas vigentes antes de crear la factura

#### Scenario: QR capturado sin conexión
- **WHEN** un DRIVER escanea un QR sin conexión y guarda el contenido con una asignación disponible
- **THEN** el dispositivo conserva el contenido sin declararlo validado y el servidor aplica el parser QR vigente al sincronizarlo

#### Scenario: Solicitud inválida al sincronizar
- **WHEN** la solicitud offline no satisface las validaciones vigentes del servidor
- **THEN** no se crea la factura y se devuelve un resultado clasificado como reintento, corrección, rechazo o conflicto según la causa

#### Scenario: QR inválido al sincronizar
- **WHEN** el parser del servidor determina que un contenido QR pendiente es inválido, incompleto o no soportado
- **THEN** no se crea la factura y el envío queda en corrección requerida sin conservar procedencia QR como válida

### Requirement: Alta excepcional con asignación histórica
El sistema MUST crear una factura desde un envío offline con asignación cerrada solo mediante una decisión versionada de un THIRD_PARTY_ADMIN autorizado. La factura resultante MUST conservar al DRIVER como propietario y la asignación histórica; la decisión administrativa MUST quedar separada de la creación original y ser auditable.

#### Scenario: Aprobación excepcional autorizada
- **WHEN** un THIRD_PARTY_ADMIN aprueba un conflicto vigente de asignación cerrada
- **THEN** el sistema crea una única factura del DRIVER propietario, conserva la asignación cerrada y registra al administrador como quien aprobó la excepción

### Requirement: Identificación del canal de captura offline
Cada factura MUST exponer el canal de captura `ONLINE` u `OFFLINE` de manera independiente de su origen MANUAL o QR. El backend MUST guardar `OFFLINE` al crear una factura desde una presentación offline y `ONLINE` al crearla desde el flujo ordinario. Las facturas existentes sin el campo MUST ser compatibles y exponerse como `ONLINE`. La lista de facturas MUST mostrar una etiqueta legible para las capturadas offline.

#### Scenario: Factura offline aceptada
- **WHEN** el servidor confirma una captura offline como factura
- **THEN** la factura se consulta con canal `OFFLINE` y la lista la identifica como registrada sin conexión

#### Scenario: Factura ingresada en línea
- **WHEN** un usuario crea una factura mediante el flujo ordinario, incluso si su origen es QR
- **THEN** la factura se consulta con canal `ONLINE`

#### Scenario: Factura histórica sin canal
- **WHEN** la aplicación lista o consulta una factura existente que no tiene `captureChannel`
- **THEN** la interpreta como `ONLINE` sin requerir migración destructiva
