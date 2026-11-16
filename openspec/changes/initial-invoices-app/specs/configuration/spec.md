# Configuration

## Purpose

Proporcionar parámetros funcionales válidos con ámbito y vigencia explícitos, de modo que los casos de uso consuman políticas configurables sin acoplarse a su almacenamiento.

## ADDED Requirements

### Requirement: Parámetros funcionales tipados y válidos
Configuration MUST validar tipo, rango permitido, ámbito y vigencia de los parámetros funcionales antes de aceptar cambios. La modificación MUST requerir permiso y contexto apropiados según la política aprobada.

#### Scenario: Valor de ventana inválido
- **WHEN** se solicita un valor de ventana de edición incompatible con el tipo o rango aprobado
- **THEN** se rechaza el cambio y se conserva el valor anterior

#### Scenario: Modificación sin permiso
- **WHEN** un actor sin autorización intenta cambiar un parámetro funcional
- **THEN** el valor efectivo no cambia

### Requirement: Política efectiva mediante un contrato
Configuration MUST proporcionar los parámetros efectivos por un contrato independiente de persistencia, con ámbito y referencia temporal explícitos. Los consumidores MUST NOT consultar su almacenamiento directamente.

#### Scenario: Consulta desde facturación
- **WHEN** un caso de uso de facturación solicita la ventana de edición para un contexto e instante
- **THEN** recibe la política efectiva según las reglas de ámbito y vigencia aprobadas
- **AND** no necesita conocer el almacenamiento de Configuration

### Requirement: Configuración ausente sin ampliación implícita
Si falta un parámetro requerido o no puede validarse, el sistema MUST aplicar únicamente un valor de respaldo expresamente aprobado o rechazar la operación dependiente. MUST NOT habilitar edición ilimitada de forma implícita.

#### Scenario: Ventana no disponible
- **WHEN** una edición requiere una ventana cuyo valor efectivo no puede obtenerse y no hay respaldo aprobado
- **THEN** no se confirma la edición como autorizada

### Requirement: Efecto temporal explícito de los cambios
La política de configuración MUST definir si los cambios afectan a facturas existentes o solo futuras, y MUST permitir verificar ese comportamiento de forma determinista.

#### Scenario: Cambio del parámetro de edición
- **WHEN** se modifica la ventana y se evalúa una factura creada antes del cambio
- **THEN** la elegibilidad usa la regla de aplicación temporal aprobada, sin depender de cachés o decisiones locales de la interfaz
