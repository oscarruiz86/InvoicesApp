# Propuesta

## Why (Motivación)

Los cambios de autorización y organización ya capturan hechos de auditoría, pero todavía no comparten un destino duradero ni un mecanismo de recuperación. Antes de considerar completa la entrega de auditoría de autorización, se necesita un contrato común de solo anexado con dos años de retención.

## What Changes (Cambios propuestos)

- Introducir en el backend un contrato de Audit para eventos de seguridad y organización normalizados y depurados.
- Persistir los eventos aceptados de forma idempotente e inmutable, y conservarlos durante dos años.
- Entregar a Audit los eventos versionados de política de autorización desde su captura duradera, con reintentos recuperables tras reinicios.
- Encaminar por el mismo contrato los cambios de asociaciones organizacionales, preservando sus garantías transaccionales.
- Mantener privado el historial de auditoría; este cambio no añade un endpoint de consulta ni habilita `audit:read`.

## Capacidades

### Capacidades nuevas
- `audit`: recepción duradera de eventos, almacenamiento idempotente, retención de dos años y entrega recuperable.

### Capacidades modificadas
- Ninguna.

## Impacto

Añade un módulo Audit en el backend, un adaptador MongoDB y su ciclo de vida de índices, un trabajador de outbox con reintentos y pruebas de integración. Identity & Access y Organizations dependerán del contrato público de Audit, no de su modelo de almacenamiento. La recepción de eventos de Keycloak se entrega mediante el cambio independiente `capture-keycloak-admin-events`.
