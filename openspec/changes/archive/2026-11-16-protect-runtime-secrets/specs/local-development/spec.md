# Spec Delta: Local Development

## ADDED Requirements

### Requirement: Secretos locales excluidos del repositorio

Compose y la documentación de desarrollo MUST suministrar los secretos SMTP, Keycloak y Mongo que los requieran mediante archivos locales ignorados o ejemplos sin credenciales. `.gitignore` MUST excluir `.env` reales, respaldos de entorno e `secrets/`, permitiendo plantillas `.example`. Las variables no sensibles pueden continuar en `.env`.

#### Scenario: Ejemplo de entorno limpio

- **WHEN** un desarrollador copia un ejemplo y configura las rutas de archivos secretos
- **THEN** el backend lee los secretos del volumen de solo lectura
- **AND** el ejemplo no contiene contraseña, token, client secret ni URI Mongo autenticada

#### Scenario: Preparación de commit

- **WHEN** existen `.env`, respaldos o archivos bajo `secrets/`
- **THEN** Git los reporta como ignorados y no los incluye al preparar todos los cambios
- **AND** las plantillas `.example` quedan visibles y versionables

#### Scenario: Desarrollo con Mongo local sin autenticación

- **WHEN** Compose conecta al Mongo local sin credenciales
- **THEN** conserva la URI local existente sin crear un secreto artificial
- **AND** esa excepción no acepta URIs productivas con credenciales inline
