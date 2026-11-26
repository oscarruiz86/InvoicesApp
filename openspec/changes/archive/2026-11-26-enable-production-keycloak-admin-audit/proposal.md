# Proposal

## Why

Identity & Access requiere evidencia de cambios de roles hechos directamente en Keycloak, pero la capacidad `keycloak-admin-audit` actual captura únicamente en desarrollo. La aplicación necesita un flujo de producción explícito, mínimo y recuperable para que un cambio externo no quede fuera de la trazabilidad aprobada.

## What Changes

- Habilitar captura de eventos administrativos de Keycloak en el entorno de producción cuando se configure el runtime correspondiente, sin incluir representaciones ni detalles libres.
- Reutilizar el recolector y la entrega idempotente existentes con una cuenta de servicio de solo lectura de eventos y secreto suministrado como archivo.
- Validar configuración de producción por separado; no arrancar el recolector si la configuración está incompleta o el destino Audit no está disponible.
- Mantener la captura de eventos de usuario fuera del alcance y conservar el procesamiento local de desarrollo.
- Preparar y documentar la configuración requerida sin desplegar servicios ni modificar una instancia real de Keycloak.
- No importar eventos históricos; el usuario confirma que el proyecto sigue en desarrollo y no hay datos que migrar.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `keycloak-admin-audit`: extender la captura administrativa al runtime productivo configurado, conservando mínimo privilegio y exclusión de representaciones.

## Impact

Afecta la configuración del recolector de backend, su ciclo de vida y documentación operativa de Keycloak/Audit. El repositorio contiene el worker y Compose local, pero no una configuración de despliegue productivo de aplicaciones; por ello este cambio no desplegará Keycloak, activará una instancia real ni aprovisionará secretos de producción. No cambia el esquema de eventos ni la retención central de dos años.
