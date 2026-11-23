# Spec Delta

## MODIFIED Requirements

### Requirement: Entorno de runtime validado y privado

El backend MUST validar variables requeridas, dependencias condicionales y formato de las opcionales antes de operar rutas privadas. La selección de almacenamiento de imágenes MUST exigir un proveedor soportado y, para `local`, raíz absoluta y namespace válidos. Una configuración inválida MUST producir HTTP 503 `CONFIGURATION_ERROR` sin revelar valores ni rutas. La compilación MUST NOT realizar E/S sobre el storage.

#### Scenario: Configuración inválida
- **WHEN** falta una variable requerida, una variable tiene formato inválido o la configuración condicional del proveedor está incompleta en runtime
- **THEN** el servicio no afirma estado operativo y responde HTTP 503 con el envelope documentado
- **AND** el diagnóstico identifica las variables problemáticas sin mostrar sus valores ni rutas

#### Scenario: Build aislado de servicios
- **WHEN** se compila con las dependencias instaladas y sin MongoDB, Keycloak ni directorio de imágenes disponibles
- **THEN** el build puede completarse sin conexiones, credenciales ni operaciones de lectura o escritura en el almacenamiento

#### Scenario: Proveedor local completo
- **WHEN** `INVOICE_IMAGE_STORAGE_PROVIDER` es `local` y la raíz absoluta y el namespace cumplen sus formatos
- **THEN** la configuración se acepta sin crear directorios ni comprobar objetos durante el parseo
