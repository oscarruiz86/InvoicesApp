# application-ui-design Specification

## Purpose

El sistema documentará de forma trazable el diseño de pantallas, navegación, permisos y estados adaptables para guiar la implementación de interfaces coherentes y accesibles.

## Requirements

### Requirement: Incorporación consentida y perfil propio

El diseño SHALL sustituir creación administrativa de identidad y asociación por subject por Invitaciones, Usuarios vinculados y Mi perfil conforme a `implement-user-invitations`. SHALL mostrar entrega al log, estados terminales sin acciones, aceptación/rechazo sin contexto previo y retorno OIDC.

#### Scenario: Invitación desde navegador nuevo
- **WHEN** se abre el enlace y se completa login o registro
- **THEN** se revisan organización, roles y datos compartidos antes de aceptar, sin afirmar envío de correo ni mostrar controles de identidad ajena

#### Scenario: Perfil y roles separados
- **WHEN** se consultan Mi perfil y Usuarios vinculados
- **THEN** Mi perfil enlaza a Keycloak y el perfil ajeno es de solo lectura con los cuatro campos compartidos mediante pertenencia activa
- **AND** gestionar roles conserva al menos uno y protege al último administrador

### Requirement: Catálogo de pantallas y trazabilidad

El diseño SHALL incluir una ficha para cada pantalla del inventario, con módulo, propósito, rol, permisos, contexto, navegación, acciones y estados aplicables. Cada ficha SHALL vincularse con el requisito funcional que la respalda o indicar la decisión pendiente.

#### Scenario: Revisión de cobertura por módulo
- **WHEN** se revisan acceso, inicio, contexto, empresas, terceros, usuarios, roles, conductores, vehículos, asignaciones, facturas, parámetros y auditoría
- **THEN** cada área tiene pantallas y recorridos identificados con trazabilidad a sus requisitos o decisiones pendientes

### Requirement: Navegación administrativa por contexto y permisos

El diseño SHALL incluir un menú adaptable por módulos, un encabezado con contexto activo y un inicio con accesos según los permisos aplicables.

#### Scenario: Usuario con permisos limitados
- **WHEN** se revisa el recorrido de un usuario con un subconjunto de permisos
- **THEN** el wireframe muestra los módulos y acciones que puede usar y la respuesta ante una ruta no autorizada

#### Scenario: Cambio de organización
- **WHEN** se revisa un cambio de contexto
- **THEN** el flujo muestra el contexto previo, la selección, la espera de confirmación y la vista resultante o la recuperación ante rechazo sin mostrar datos del contexto previo como si fueran del nuevo

### Requirement: Patrones visuales y estados verificables

El diseño SHALL definir patrones compartidos para navegación, tablas, formularios, diálogos y retroalimentación. Los wireframes SHALL documentar escritorio y móvil, navegación por teclado y foco visible, además de carga, vacío, error, permisos y confirmación donde correspondan.

#### Scenario: Revisión en dos tamaños
- **WHEN** se revisan un listado, un formulario y un detalle a 360 px y 1280 px
- **THEN** las acciones principales y mensajes siguen accesibles y las anotaciones indican el orden de foco y el comportamiento adaptable

### Requirement: Recorridos de facturación y flota

El diseño SHALL documentar los recorridos de asignación, reasignación e historial, y los de consulta, registro manual, captura QR y edición de facturas. Los estados visibles SHALL corresponder a las políticas funcionales aplicables.

#### Scenario: Registro con QR
- **WHEN** se revisa la captura QR
- **THEN** se identifican estados de permiso de cámara, QR inválido, revisión, asignación inválida, confirmación y campos protegidos

#### Scenario: Edición manual fuera de la ventana
- **WHEN** se revisa una factura fuera del plazo permitido
- **THEN** el diseño conserva su consulta autorizada y comunica el motivo por el que la edición no está disponible

#### Scenario: Reasignación con historial
- **WHEN** se revisa el cambio de tercero de un vehículo
- **THEN** el flujo muestra la confirmación, la asignación vigente, el historial previo y el estado de conflicto si el cambio se rechaza
