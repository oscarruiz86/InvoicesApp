# frontend-shell Specification

## Purpose

Ofrecer una aplicación web provisional navegable y responsive que permita verificar la base de presentación y su comunicación con la API antes de desarrollar módulos de negocio.

## Requirements

### Requirement: Shell provisional navegable y responsive
La WebApp MUST mostrar una pantalla inicial identificada como Invoices App, con layout adaptable y tema global consistente. MUST ofrecer una vista de ruta no encontrada sin presentar funcionalidades de negocio aún no implementadas.

#### Scenario: Pantalla inicial en móvil y escritorio
- **WHEN** se abre `/` en anchos de 360 px y 1280 px
- **THEN** se muestran cabecera y contenido provisional legibles con el mismo tema global
- **AND** no hay desplazamiento horizontal causado por el layout

#### Scenario: Ruta desconocida y recarga
- **WHEN** se accede o recarga una ruta no definida de la WebApp
- **THEN** la aplicación muestra su vista de ruta no encontrada dentro del layout, sin invocar una página de producto del backend

### Requirement: Estado observable de comunicación con API
La pantalla provisional MUST consultar la salud de la API y distinguir carga, disponibilidad y error. Tras un fallo MUST permitir un reintento explícito sin requerir recargar toda la aplicación.

#### Scenario: API disponible
- **WHEN** la consulta de salud está pendiente y luego devuelve el resultado válido esperado
- **THEN** la UI pasa de carga a API disponible

#### Scenario: API no disponible y recuperación
- **WHEN** falla una consulta y el usuario reintenta después de recuperar la API
- **THEN** la UI muestra primero un error comprensible, vuelve a carga durante el reintento y finalmente muestra disponibilidad

### Requirement: Configuración pública validada
El frontend MUST validar su base de API antes de iniciar comunicación. La configuración enviada al navegador MUST contener únicamente valores públicos, sin URI de base de datos, credenciales ni configuración privada del backend.

#### Scenario: Base de API inválida
- **WHEN** la base configurada no cumple el formato admitido
- **THEN** la aplicación informa un problema de configuración sin realizar solicitudes a un destino indeterminado

#### Scenario: Inspección del bundle público
- **WHEN** se inspeccionan los assets generados con la configuración de ejemplo
- **THEN** no contienen URI MongoDB, secretos ni direcciones internas de Docker destinadas al servidor

### Requirement: Comunicación desacoplada y cancelable
La presentación MUST acceder a la API mediante casos de uso y contratos sustituibles. La comunicación externa MUST contar con tiempo de espera finito y cancelación, sin persistencia ni llamadas HTTP directas desde componentes visuales.

#### Scenario: Sustitución del adaptador
- **WHEN** se prueba el caso de uso con un puerto de salud de prueba
- **THEN** se verifican éxito y fallo sin servidor HTTP ni cambios en las reglas del caso de uso

#### Scenario: Solicitud que no termina
- **WHEN** una solicitud excede su tiempo de espera o se cancela
- **THEN** deja de permanecer indefinidamente en carga y el flujo distingue el resultado correspondiente

### Requirement: Gestión centralizada de errores y estado de interfaz
Los errores de red, timeout, HTTP y respuesta inválida MUST traducirse a categorías y mensajes consistentes. Los errores de render MUST mostrar una alternativa controlada. El estado centralizado de UI MUST NOT convertirse en autoridad de permisos o reglas de negocio.

#### Scenario: Error HTTP con cuerpo no JSON
- **WHEN** la API o su proxy devuelve un error con un cuerpo de texto o HTML
- **THEN** la UI presenta un error consistente sin fallar al interpretar el cuerpo ni mostrar información técnica sensible

#### Scenario: Respuesta exitosa malformada
- **WHEN** la consulta recibe HTTP 200 con un cuerpo que no cumple el contrato de salud
- **THEN** la UI muestra un error de respuesta inválida y no afirma que la API esté disponible

#### Scenario: Error de render
- **WHEN** ocurre un fallo de render dentro de la superficie protegida por el límite de errores
- **THEN** se muestra una vista de recuperación controlada en lugar de una pantalla vacía

### Requirement: La autenticación conserva la ruta protegida actual

Cuando una ruta protegida requiere autenticación, el sistema MUST conservar su ruta relativa, query y fragmento por la duración del callback OIDC y MUST volver a esa ubicación después del inicio de sesión. El destino MUST ser de mismo origen y MUST NOT ser el callback de autenticación.

#### Scenario: Retorno a una ruta protegida
- **WHEN** una persona recarga `/parameters?page=2#history` sin sesión y completa el inicio de sesión
- **THEN** vuelve a `/parameters?page=2#history`

#### Scenario: Destino no confiable
- **WHEN** el destino guardado es externo, malformado o apunta al callback OIDC
- **THEN** la aplicación usa `/session` como destino seguro
