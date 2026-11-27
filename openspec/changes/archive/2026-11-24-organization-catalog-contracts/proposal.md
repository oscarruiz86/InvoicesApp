# Proposal

## Why

Los manejadores de catálogos están tipados directamente contra la fábrica MongoDB, lo que mezcla presentación e infraestructura y dificulta sustituir el repositorio en pruebas. Además, algunos fixtures de empresas y terceros no reflejan las reglas NIT/CC ya especificadas, por lo que las pruebas pueden describir datos inválidos.

## What Changes

- Definir `CatalogRepositoryPort` en la capa de aplicación e inyectarlo en los manejadores HTTP; conservar MongoDB como adaptador actual.
- Alinear pruebas de dominio e interfaz para que los NIT incluyan dígito de verificación y las cédulas CC no lo incluyan.
- Mantener sin cambios las reglas de negocio, endpoints, persistencia y respuestas de catálogos, empresas y terceros.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

Ninguna. Las especificaciones vigentes ya describen el contrato de catálogos y las reglas NIT/CC. Este cambio es un refactor interno y una corrección de cobertura de pruebas, por lo que se declara `skip_specs: true`.

## Impact

Afecta al contrato interno del módulo `parametric-catalogs` y a las pruebas unitarias de catálogos, empresas y terceros en backend y frontend. No cambia la API pública ni requiere migraciones o dependencias nuevas.
