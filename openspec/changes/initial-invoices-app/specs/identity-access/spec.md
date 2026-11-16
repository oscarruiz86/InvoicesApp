# Identity & Access

## Purpose

Establecer una identidad autenticada y permisos generales mediante un proveedor externo, manteniendo independientes las reglas de aplicación y la autorización organizacional.

## ADDED Requirements

### Requirement: Identidad validada mediante un contrato sustituible
El backend MUST obtener el actor autenticado mediante un contrato independiente del proveedor de identidad. La integración externa MUST traducir credenciales y errores sin introducir dependencias del proveedor en Domain o Application.

#### Scenario: Identidad válida
- **WHEN** el proveedor confirma una credencial válida para el emisor y la audiencia esperados
- **THEN** la aplicación recibe un actor interno con identidad y permisos generales verificados
- **AND** sus reglas no necesitan interpretar estructuras específicas del proveedor

#### Scenario: Credencial inválida o expirada
- **WHEN** se presenta una credencial inválida, expirada o de un emisor o audiencia no permitidos
- **THEN** la operación protegida no se ejecuta y se devuelve el error de autenticación documentado

#### Scenario: Proveedor indisponible
- **WHEN** no puede verificarse la identidad conforme al contrato de autenticación
- **THEN** no se concede acceso por defecto

### Requirement: Roles y organización son verificaciones complementarias
Los permisos generales MUST evaluarse junto con las asociaciones, el contexto organizacional y el recurso en el backend. Un rol o contexto declarado por el cliente MUST NOT sustituir esa verificación.

#### Scenario: Rol suficiente sin asociación válida
- **WHEN** un actor tiene el permiso general solicitado pero no una asociación válida con la organización del recurso
- **THEN** el backend rechaza la operación y no modifica el recurso

#### Scenario: Permiso declarado libremente en la solicitud
- **WHEN** el cliente envía un rol o permiso que la identidad verificada no acredita
- **THEN** ese dato no concede autorización

### Requirement: Autenticación verificable sin proveedor real
Los casos de uso que dependen de identidad MUST poder probarse con implementaciones compatibles del contrato de autenticación, sin ejecutar el proveedor externo.

#### Scenario: Sustitución en pruebas
- **WHEN** se inyecta una identidad de prueba con los mismos resultados y errores del contrato
- **THEN** pueden verificarse decisiones de acceso sin cambiar reglas de negocio ni levantar servicios externos
