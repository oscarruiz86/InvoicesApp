# Notificaciones por correo

El formato común de secretos montados y la rotación de credenciales están descritos en [runtime-secrets.md](runtime-secrets.md).

Las invitaciones organizacionales son el primer tipo de notificación. La API escribe el registro de outbox en la misma transacción MongoDB que la invitación. El worker separado reclama trabajos mediante leases; SMTP puede entregar más de una vez si el servidor acepta un mensaje y el proceso cae antes de registrar el resultado. No hay promesa exactamente una vez.

## Retención e idempotencia

Los registros terminales `SENT`, `FAILED` y `SUPPRESSED`, junto con sus claves de idempotencia, se conservan 90 días desde el estado terminal y luego se eliminan. La expiración se guarda como `retentionUntil` y el worker ejecuta la limpieza cada hora. Los documentos con una proyección pendiente nunca se eliminan; se retienen hasta completar esa proyección. Los registros terminales existentes se migran una vez al iniciar el repositorio, tomando `updatedAt` como fecha terminal y `createdAt` como respaldo.

La idempotencia solo se garantiza mientras exista el registro; una solicitud repetida después de esos 90 días puede crear una nueva notificación. El payload cifrado que contiene el token se elimina al alcanzar estado terminal. El registro conserva destinatario, clave de idempotencia, referencia funcional, intentos y resultado durante los 90 días aprobados; al vencer ese plazo, el registro completo se elimina. La retención no cambia las invitaciones en Organizations.

## Desarrollo con Compose

1. Copia `.env.example` a `.env` y configura `SMTP_SECRET_DIR=./secrets`. La carpeta `secrets/` está excluida de Git.
2. Crea una clave AES-256 de 32 bytes en `secrets/notification-payload-key`. Puede escribirse como 64 caracteres hexadecimales o Base64 de 32 bytes. Ejemplo PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force secrets | Out-Null
   $bytes = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes) | Set-Content -NoNewline secrets/notification-payload-key
   ```

3. Mantén `SMTP_ENABLED=false` para desarrollo sin proveedor. En ese modo el worker marca los trabajos `SUPPRESSED` y no abre conexiones SMTP.
4. Para habilitar SMTP, define `SMTP_ENABLED=true`, host, puerto, remitente y modo `implicit` o `starttls`. Si el servidor requiere autenticación, configura `SMTP_USERNAME` y escribe la contraseña en `secrets/smtp-password`. No pongas el secreto en `.env`.
5. Configura `INVITATION_PUBLIC_ORIGIN` con el origen HTTPS público (HTTP se permite solo en localhost durante desarrollo).
6. Inicia `docker compose up`; `notification-worker` es un servicio separado del backend HTTP.

## Producción en un host Docker Compose

El archivo `compose.notifications.production.yaml` despliega una sola instancia del worker. MongoDB debe estar disponible externamente y la URI debe tener permisos mínimos sobre la base de la aplicación. El host proporciona los archivos secretos mediante bind mounts de solo lectura; Compose no almacena sus contenidos ni los cifra por sí mismo. El proceso corre como usuario `node` (UID 1000); configura propietario/grupo/permisos del host para permitir lectura a ese usuario y denegarla a terceros. La auditoría de acceso, revocación (retirar permisos o desmontar el archivo) y disponibilidad pertenecen a la administración del host; este mecanismo no ofrece identidad de workload ni auditoría central por sí solo.

1. Construye e inicia el servicio: `docker compose --env-file .env.notifications.production -f compose.notifications.production.yaml up -d --build`.
2. En `.env.notifications.production`, define `INVITATION_PUBLIC_ORIGIN` (HTTPS), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_TLS_MODE=starttls` (o `implicit`), `SMTP_FROM_ADDRESS`, y las rutas host `MONGODB_URI_SECRET_FILE`, `SMTP_PASSWORD_SECRET_FILE`, `NOTIFICATION_PAYLOAD_KEYS_DIR`. Define `NOTIFICATION_PAYLOAD_KEY_FILES=1=/run/secrets/notification-payload-keys/v1` y `NOTIFICATION_PAYLOAD_ACTIVE_KEY_VERSION=1`. Este archivo contiene rutas/configuración, nunca valores de secretos.
3. Crea los archivos en el host con permisos que permitan lectura al usuario `node` dentro del contenedor (UID 1000) y nieguen acceso a otros usuarios. Habilita cifrado de disco del host y copias de seguridad protegidas para MongoDB y las claves. El archivo de Mongo debe contener una URI en una sola línea; el de SMTP, una contraseña.
4. Verifica `docker compose ... ps` y el estado `healthy`. La sonda de salud está disponible en el host solo por `127.0.0.1:8090/health/ready`; `/health/live` indica que el proceso vive y `/metrics` expone datos agregados sin destinatarios, tokens, nombres ni contenidos.
5. Conecta el recolector Prometheus del host a `127.0.0.1:8090/metrics` y carga `deploy/notifications/prometheus-alerts.yml`. Las reglas alertan sobre worker no listo, cola atrasada, fallos terminales, proyecciones pendientes y limpieza detenida. Configura el destino de alertas en el sistema de monitorización existente.

El límite inicial del contenedor es 1 CPU y 512 MiB, con 128 procesos; solo se ejecuta un worker. Ajusta estos límites luego de observar carga y memoria en preproducción. El worker deja terminar el trabajo en curso al recibir `SIGTERM`/`SIGINT`, con `stop_grace_period` de 150 segundos. Si el host se reinicia o el lease expira, el trabajo se recupera; una entrega SMTP puede repetirse en el borde de caída indicado arriba.
### Operación e incidentes

- Pausar procesamiento y limpieza: `docker compose --env-file .env.notifications.production -f compose.notifications.production.yaml stop notification-worker`. La API puede seguir creando trabajos, que permanecen pendientes en Mongo.
- Reanudar: `docker compose --env-file .env.notifications.production -f compose.notifications.production.yaml up -d notification-worker`; comprueba `ps`, `/health/ready`, `/metrics` y las alertas.
- Actualizar imagen: ejecuta `docker compose ... up -d --build --force-recreate notification-worker` y confirma `healthy` antes de cerrar el cambio.
- Ante una caída abrupta, verifica salud Mongo, estado de leases y errores agregados; al vencer un lease el worker vuelve a reclamar el trabajo. SMTP puede duplicar una entrega en el borde de aceptación/caída; revisa con el proveedor usando referencias disponibles y evita reenviar manualmente sin verificar.
- Para detener la aceptación de nuevas notificaciones también debe pausarse el componente API que las encola según el procedimiento de despliegue de la aplicación; parar el worker por sí solo conserva los trabajos y detiene también el purgado de retención.
- No escales este servicio en el host: la configuración aprobada usa un único worker para evitar paralelismo operativo no medido. Evalúa CPU, memoria, cola y latencia antes de cambiar recursos o concurrencia.

### Rotación de clave de cifrado

Las claves tienen versiones de 1 a 255. `NOTIFICATION_PAYLOAD_KEY_FILES` usa entradas `versión=ruta` separadas por `;`; la versión activa cifra los nuevos payloads y cada registro indica qué versión necesita para descifrar.

Para rotar: genera un archivo nuevo `v2` con 32 bytes aleatorios; monta simultáneamente `v1` y `v2`; configura `NOTIFICATION_PAYLOAD_KEY_FILES=1=/run/secrets/notification-payload-keys/v1;2=/run/secrets/notification-payload-keys/v2` y cambia la activa a `2`; reinicia primero la API y luego el worker para que ambos compartan el keyring. Mantén la clave anterior hasta comprobar en Mongo que no hay trabajos no terminales con `payload.keyVersion: 1` (estados `PENDING` o `PROCESSING`); un trabajo terminal con proyección pendiente no necesita la clave porque su payload se borró al cerrar el envío. Tras esa comprobación puede retirarse del montaje activo. Conserva una copia de recuperación cifrada y con acceso restringido; perder una clave mientras haya payloads pendientes impide descifrarlos. Los payloads terminales ya se borraron y no requieren conservar su clave.

## Reintentos, seguridad y estado

Se realizan hasta cinco intentos totales: inicial inmediato y reintentos a 1, 5, 15 y 60 minutos solo para fallos temporales SMTP. El worker no envía invitaciones vencidas, canceladas o reemplazadas por un reenvío. El token se cifra con AES-256-GCM en la outbox y se elimina después de un estado terminal. El correo contiene el enlace en el fragmento URL para que el token no viaje al servidor web en la petición HTTP inicial.

Los estados de la outbox son `PENDING`, `PROCESSING`, `SENT`, `FAILED` y `SUPPRESSED`. El campo `deliveryStatus` de Organizations permanece `UNKNOWN` mientras se procesa y se proyecta a `LOGGED` o `FAILED` al alcanzar un estado terminal. `LOGGED` es el valor de éxito heredado del contrato de invitaciones y aquí representa una entrega SMTP completada; no indica que el enlace se haya escrito en logs. Si falla esa proyección, se reintenta por separado sin volver a enviar el correo.

No se registran cuerpos renderizados, contraseñas SMTP, tokens, URIs Mongo ni respuestas SMTP crudas. Los logs operativos contienen solo códigos genéricos y recuentos.
