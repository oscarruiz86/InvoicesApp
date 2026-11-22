# Propuesta

## Why (Motivación)

Los cambios administrativos realizados en Keycloak todavía no generan registros duraderos y normalizados en Audit. Capturarlos en desarrollo local permite validar el flujo productor y la recuperación operativa antes de depender de él para el trabajo de autorización.

## What Changes (Cambios propuestos)

- Habilitar la captura de eventos administrativos de Keycloak únicamente en el realm local/de desarrollo importado, con los detalles del evento desactivados.
- Añadir un recolector exclusivo de desarrollo que lea la API REST de administración de Keycloak con una cuenta de servicio de privilegios mínimos.
- Transformar únicamente los hechos administrativos aprobados al contrato normalizado de Audit y entregarlos de forma idempotente mediante consultas recuperables tras reinicios.
- Mantener sin cambios la configuración del realm de producción y sus servicios de ejecución.

## Capacidades

### Capacidades nuevas
- `keycloak-admin-audit`: captura en desarrollo, normalización que protege la privacidad y entrega recuperable de eventos administrativos de Keycloak a Audit.

### Capacidades modificadas
- Ninguna.

## Impacto

Modifica la importación del realm local de Keycloak, el perfil de desarrollo de Compose, el recolector de eventos del backend, las fixtures de prueba y la documentación de operaciones locales. El recolector recibe un escritor de Audit inyectado; el cambio independiente de Audit aporta la implementación MongoDB y la política de retención.
