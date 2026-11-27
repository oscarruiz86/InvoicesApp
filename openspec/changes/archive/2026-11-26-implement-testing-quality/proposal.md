# Proposal

## Why

Invoices App ya cuenta con pruebas unitarias, verificaciones arquitectónicas, suites de integración, contratos HTTP/OpenAPI y E2E, pero no hay una guía operativa única que aclare qué cubre cada comando ni qué evidencia corresponde exigir a cada tipo de cambio. La documentación histórica además registra resultados y límites distintos por incremento, lo que puede llevar a tratar `check` como aceptación completa o a repetir verificaciones no pertinentes.

## What Changes

- Definir niveles de verificación compatibles con los scripts actuales: checks locales por aplicación, integración con servicios aislados y aceptación HTTP/OpenAPI/E2E según el alcance tocado.
- Aclarar qué comprueba y qué no comprueba cada comando existente; `check` no se presentará como sustituto de integración, OpenAPI, builds o E2E.
- Establecer criterios para seleccionar y registrar pruebas focales por capacidad, incluyendo fallos, autorización, aislamiento, concurrencia y límites arquitectónicos cuando apliquen.
- Estandarizar el uso de fixtures/datos y servicios de prueba aislados, con nombres protegidos, limpieza acotada y sin ejecutar operaciones sobre datos locales u operativos.
- Definir cómo registrar comandos, resultados, omisiones, fallos conocidos y límites de evidencia en `docs/verification.md`, sin convertir resultados históricos en estado actual.
- Mantener las herramientas, dependencias, suites y scripts existentes; no fijar umbrales de cobertura ni agregar CI/gates hasta decidir proveedor y política del repositorio.

## Capabilities

### New Capabilities

- `testing-quality`: niveles, selección, aislamiento y comunicación verificable de la calidad técnica durante cambios incrementales.

### Modified Capabilities

Ninguna. Los requisitos de prueba específicos siguen perteneciendo a cada capacidad de negocio.

## Impact

Afecta documentación de desarrollo/verificación, los scripts existentes en `backend/package.json` y `frontend/package.json`, sus suites Vitest/Playwright, fixtures preparados, y las comprobaciones de arquitectura. No se añaden dependencias. No se encontró configuración de pipeline CI en los archivos de configuración de CI consultados; elegir proveedor y gates queda fuera hasta acordar esa política.
