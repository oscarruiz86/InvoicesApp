# Design

## Contexto

implement-notifications añadió persistencia MongoDB, un worker Node independiente, entrega SMTP, cifrado AES-256-GCM y lectura de secretos desde archivos montados. La retención automática, el gestor productivo de secretos y la plataforma/operación productiva del worker permanecieron pendientes por decisión de alcance.

## Objetivos

- Resolver las decisiones operativas que bloquean el paso seguro de notificaciones a producción.
- Mantener API y worker como procesos independientes y conservar las garantías existentes de idempotencia, leases, reintentos y privacidad.
- No fijar plazos, proveedores, plataformas ni niveles de servicio sin decisión del propietario operativo.

## Decisiones que deben tomarse

1. Retención: plazos por estado, tratamiento de destinatarios y referencias funcionales, obligaciones de auditoría/legal, borrado físico o anonimización, y proceso para registros antiguos.
2. Secretos: proveedor y mecanismo de montaje/inyección, permisos de lectura, rotación/versionado de la clave AES, recuperación ante pérdida de clave, backup, revocación y renovación de contraseña SMTP.
3. Worker: entorno/orquestador productivo, número inicial de instancias, límites de concurrencia, recursos, escalado, health/readiness, apagado ordenado, alertas y responsable de guardia.

## Límites

- La aplicación seguirá leyendo secretos mediante SecretReader; el adaptador concreto se seleccionará luego de aprobar el proveedor.
- El worker seguirá procesando trabajos desde MongoDB con leases; no se añadirá una cola local ni se cambiará su política de reintentos como parte de esta decisión.
- No habilitar retención destructiva ni despliegue productivo automático antes de aprobar su política y entorno.
- El plan de rotación debe permitir descifrar trabajos aún activos durante una transición de clave o definir su tratamiento seguro.
- Las métricas, logs y alertas seguirán excluyendo destinatarios completos, enlaces, tokens, cuerpos y secretos.

## Validación prevista

La aceptación se realizará en un entorno de preproducción con SMTP de prueba: comprobar política de retención, lectura y rotación de secretos, reinicio y escalado del worker, recuperación de leases y alertas de fallos sin reenvíos causados únicamente por una proyección pendiente.