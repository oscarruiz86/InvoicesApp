# Spec Delta

## MODIFIED Requirements

### Requirement: Revisión protegida antes del registro

La interfaz MUST analizar localmente el texto decodificado y mostrar los datos extraídos en solo lectura, sin solicitar una previsualización al servidor. Los datos MUST NOT corregirse ni completarse desde el flujo QR. El usuario MUST seleccionar una asignación propia elegible y confirmar explícitamente. La captura visual MUST NOT crear la factura por sí sola ni adjuntar automáticamente la imagen utilizada para leer.

#### Scenario: Captura válida
- **WHEN** se lee contenido válido y completo
- **THEN** presenta los datos bloqueados, selección de vehículo/asignación y opción independiente de adjuntar imagen antes de confirmar

#### Scenario: Varios códigos en la escena
- **WHEN** hay varios códigos visibles o la lectura no corresponde a la factura deseada
- **THEN** se pausa tras un resultado, permite rechazarlo y exige nueva captura enfocada antes de confirmar

#### Scenario: Revisión local sin petición de preview
- **WHEN** el navegador decodifica un QR de factura
- **THEN** analiza el contenido y muestra la revisión sin llamar a `POST /api/invoices/qr/preview`
