# Proposal

## Why

La aplicación ya tiene un journal `audit_events` durable, pero su contrato y sus productores cubren solo una parte de las operaciones aprobadas. Facturas, flota, catálogos y cambios de organización conservan eventos locales que no llegan al journal común, por lo que no existe trazabilidad central uniforme aunque varios módulos ya prometan auditoría durable.

## What Changes

- Completar el contrato compartido de Audit para aceptar hechos normalizados de los módulos de negocio que actualmente solo registran eventos locales.
- Registrar en el journal central las mutaciones aprobadas de organizaciones, invitaciones/pertenencias, flota, facturas, sincronización offline, configuración y catálogos, preservando actor, resultado, correlación, ámbito, recurso e identidad estable del evento.
- Confirmar la mutación de negocio y su hecho de auditoría en la misma transacción cuando el productor ya usa MongoDB transaccional; donde la entrega deba diferirse, conservar un outbox durable y reintentable.
- Mantener los historiales locales que usan los módulos para sus propias consultas y reglas. El journal compartido será una evidencia transversal adicional y no una API de historial de negocio.
- Conservar el registro de denegaciones con límites de volumen, la captura existente de cambios de política y la recolección de Keycloak habilitada solo en desarrollo.
- Mantener los eventos append-only, idempotentes, depurados y sujetos a la retención de dos años ya aprobada.
- No migrar historiales locales anteriores: el proyecto sigue en desarrollo y el usuario confirma que no hay datos históricos que trasladar. La captura común empezará con las nuevas operaciones.
- Mantener fuera de este cambio la habilitación de captura Keycloak en producción y la consulta de auditoría desde la interfaz; se preparan como propuestas OpenSpec separadas para resolver sus políticas y límites propios.
- No exponer endpoints de lectura, habilitar `audit:read`, crear pantallas de consulta ni cambiar permisos existentes.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `audit`: precisar la cobertura de productores de negocio y exigir que los eventos confirmados de los módulos aprobados alcancen el journal central con garantías transaccionales o de entrega durable.

## Impact

Afecta el contrato y escritor del módulo `backend/src/modules/audit`, los adaptadores y repositorios de Organizations, Fleet, Invoices, Invoice Sync, Configuration y Parametric Catalogs, y los workers/outboxes cuando sean necesarios. Se conservarán las colecciones locales existentes y los contratos de consulta actuales. No se importan datos históricos ni se añaden rutas REST, permisos, dependencias externas o consultas de historial.
