# Proposal

## Why

Invoices App ya cuenta con una operación funcional de invitaciones organizacionales, pero su envío actual es sincrónico y el adaptador de pruebas escribe el enlace con token en logs. Hace falta una capacidad de notificaciones durable que desacople la decisión de negocio del canal y del transporte, y que pueda ampliarse con otros canales.

## What Changes

- Añadir un contrato común de solicitud con tipo, canal, destinatario, idioma, variables, referencia funcional y clave de idempotencia.
- Persistir solicitudes y entregas en MongoDB con estados, intentos, marcas de tiempo y resultados normalizados.
- Procesar envíos mediante un worker separado, con protección contra duplicados y hasta cinco intentos con espera de 1, 5, 15 y 60 minutos para fallos temporales.
- Añadir plantillas estáticas por tipo e idioma, con asunto, texto plano, HTML opcional, validación de variables y escape del contenido interpolado.
- Implementar el correo como canal inicial mediante SMTP configurable en `.env`; la contraseña y la clave de cifrado se obtienen desde archivos secretos montados mediante un puerto `SecretReader`.
- Reemplazar la entrega de invitaciones que registra enlaces en logs por una solicitud durable de notificación y seguimiento del estado final.
- Cifrar el token de invitación persistido para entrega asíncrona y eliminarlo al terminar o al quedar inválido el envío.

Las reglas funcionales seguirán desacopladas del canal y el transporte. No se elige proveedor SMTP ni gestor productivo de secretos; tampoco se fija política de retención automática.

## Capacidades

### Nueva capacidad

- `notifications`: contrato, persistencia durable, procesamiento extensible, plantillas seguras y correo SMTP.

## Impacto

La implementación afectará `backend/src/modules/notifications`, la composición/worker en `backend/src/bootstrap` y el paquete backend, configuración runtime, MongoDB y el flujo de invitaciones organizacionales. El cambio reemplaza el adaptador de entrega de prueba que registraba enlaces sensibles. No añade otros productores funcionales.

## Fuera de alcance

Otros canales y proveedores SMTP, consola de administración, reentrega manual, catálogo adicional de eventos, selección de un gestor productivo de secretos, y eliminación automática hasta aprobar retención.
