# Tasks

Decisiones operativas aprobadas por el usuario: retención de 90 días desde estado terminal; secretos mediante archivos montados por el entorno; worker en Docker Compose de un host. La implementación se valida en desarrollo; preproducción y montaje de secretos reales permanecen pendientes.

## 1. Política de retención de notificaciones

- [x] 1.1 Aprobar retención uniforme de registros terminales, incluidos destinatario, referencias, intentos y claves de idempotencia, durante 90 días desde el estado terminal; eliminar el payload/token al cerrar y permitir nueva solicitud tras expirar la clave.
- [x] 1.2 Documentar la política aprobada, alcance de registros históricos, excepciones y procedimiento de recuperación; actualizar el requisito de Notifications antes de implementar borrado.
- [x] 1.3 Implementar retención automática en MongoDB conforme a la política aprobada, evitando eliminar trabajos no terminales, proyecciones pendientes o datos aún necesarios para recuperar el servicio.
- [x] 1.4 Verificar en MongoDB real temporal la migración, vencimiento, limpieza por proceso, exclusión de trabajos activos/proyecciones, recuento de borrados y campos retenidos; documentar la pausa segura.

## 2. Gestor productivo de secretos

- [x] 2.1 Seleccionar archivos montados de solo lectura; documentar límites del mecanismo, permisos del host/usuario node, auditoría/revocación/alta disponibilidad a cargo del host y ausencia de identidad de workload administrada.
- [x] 2.2 Implementar el adaptador productivo de SecretReader para contraseña SMTP y claves AES versionadas, sin incluir valores secretos en .env, imágenes, logs o resultados.
- [x] 2.3 Definir y documentar generación, rotación, coexistencia de claves durante el descifrado de trabajos pendientes, backup y recuperación ante pérdida o revocación.
- [ ] 2.4 Verificar en preproducción acceso permitido/denegado, secreto ausente, rotación con trabajos pendientes, restauración controlada y ausencia de exposición de valores.

## 3. Operación productiva del worker

- [x] 3.1 Elegir plataforma/orquestador, configuración de producción, recursos iniciales, número de réplicas, concurrencia y criterios de escalado del worker separado.
- [x] 3.2 Crear configuración/artefactos de despliegue que ejecuten el target worker con MongoDB y secretos requeridos, sin exponer el servidor HTTP ni depender de Compose de desarrollo.
- [x] 3.3 Implementar health/readiness, apagado ordenado, reinicio por Compose y recuperación durable de leases ante terminación abrupta.
- [x] 3.4 Añadir observabilidad operativa y alertas para cola pendiente/antigua, reintentos, fallos terminales, worker sin progreso y errores de proyección, manteniendo logs sin datos sensibles.
- [x] 3.5 Documentar runbook de despliegue/actualización, límites de escalado, pausa/reanudación, recuperación, rotación, incidentes y entrega SMTP.
- [ ] 3.6 Verificar en preproducción health/readiness, apagado ordenado, recuperación de leases y alertas con fallos simulados.
