# Proposal

## Why

La capacidad de notificaciones ya entrega invitaciones de forma durable, pero tres decisiones necesarias para producción quedaron explícitamente fuera del alcance de implement-notifications: retención automática, integración con un gestor productivo de secretos y operación del worker en producción. Sin resolverlas, no se debe asumir que los defaults de desarrollo describen un despliegue productivo completo.

## What Changes

- Definir y aplicar una política aprobada de retención/eliminación de solicitudes, intentos y metadatos de notificación.
- Seleccionar e integrar el mecanismo productivo de suministro de la contraseña SMTP y la clave AES a través del puerto SecretReader, con ciclo de rotación documentado.
- Definir y preparar la operación independiente del worker en producción: despliegue, configuración, escalado, señales de salud, observabilidad y respuesta ante fallos.
- Documentar decisiones operativas y verificar el comportamiento con un entorno de preproducción representativo.

## Capacidades

### Capacidades modificadas

- notifications: añade garantías y operación de producción para retención, secretos y procesamiento asíncrono.

## Dependencia

Este cambio es secuencial respecto de implement-notifications: primero debe integrarse y archivarse ese cambio para crear la capacidad base notifications; después se pueden implementar y archivar estas extensiones operativas.

## Impacto

Este cambio complementa backend/src/modules/notifications, backend/src/bootstrap/run-notification-worker.ts, el target worker de backend/Dockerfile, la configuración de despliegue y docs/notifications.md. El mecanismo de secretos, la plataforma de ejecución y los plazos de retención se decidirán antes de implementarlos; esta propuesta no presupone proveedor ni entorno específico.

## Fuera de alcance

Añadir nuevos productores o canales, cambiar el transporte SMTP, administrar notificaciones desde UI, reenvío manual, garantías de entrega exactamente una vez y modificar la política funcional de invitaciones.