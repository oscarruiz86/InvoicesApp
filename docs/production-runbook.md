# Runbook de producción en TrueNAS SCALE

Este procedimiento es una plantilla para Apps → Custom App/YAML en TrueNAS SCALE 25.10.2.1. Debe validarse en una app aislada con el mismo Traefik, montaje de secretos y datasets antes de usarla con datos reales. No se conecta al API administrativo de TrueNAS desde GitHub Actions.

## Preparación de infraestructura

1. Confirma el dataset privado y permisos para imágenes, el directorio de claves SMTP y los archivos de secretos. La ruta y retención del respaldo, RPO/RTO y alertas quedan a decisión de infraestructura.
2. Antes de cambiar MongoDB, realiza un respaldo recuperable y ensaya la restauración en una instancia aislada. Verifica qué clientes usan el servicio actual. En la consola administrativa de MongoDB, crea la base `invoices`, una cuenta de aplicación con solo `readWrite` sobre esa base, activa autenticación y configura un replica set compatible con la versión instalada. El contenido del archivo apuntado por `MONGODB_URI_SECRET_FILE` debe autenticarse como ese usuario sobre `invoices` y declarar el nombre real del replica set (`replicaSet=...`). Conserva MongoDB y su puerto únicamente en la red privada. El replica set de un solo host habilita transacciones pero no aporta alta disponibilidad.
3. Prueba conexión autenticada, transacciones multidocumento, lecturas/escrituras de prueba y una nueva restauración antes de habilitar escrituras productivas. Mantén la aplicación en mantenimiento hasta completar todos los criterios.
4. Configura el cliente público de Keycloak para WebApp con redirect URI y Web Origins exactos para `https://invoice.oarg.casa`. El issuer del navegador y de los JWT es `https://auth.oarg.casa/realms/invoices`. En backend, `KEYCLOAK_PRIVATE_ISSUER_URL` y `KEYCLOAK_PRIVATE_JWKS_URL` deben apuntar al host privado con TLS confiable y el mismo realm; no cambies el issuer que valida los tokens. Define `KEYCLOAK_AUDIENCE` para el cliente API.

## Secretos y variables de Custom App

Usa las pantallas/archivos protegidos de TrueNAS para URI Mongo, secreto de cliente privado Keycloak, SMTP y claves de payload. En el manifiesto define las rutas host `MONGODB_URI_SECRET_FILE`, `KEYCLOAK_DIRECTORY_SECRET_FILE`, `SMTP_PASSWORD_SECRET_FILE`, `NOTIFICATION_KEYS_PATH` e `INVOICE_IMAGES_PATH`; mantén los archivos legibles por UID 1000 y solo lectura en contenedor. No pegues valores de credenciales en `environment`. Configura además `DOCKERHUB_NAMESPACE` (igual a la variable GitHub `DOCKERHUB_USERNAME`), `IMAGE_TAG`, `TRAEFIK_NETWORK`, `KEYCLOAK_DIRECTORY_CLIENT_ID`, las dos URLs privadas de Keycloak, audiencia, namespace de almacenamiento y variables SMTP. Ninguna de estas variables autoriza publicar puertos de backend o datos.

Importa el YAML en Apps → Discover Apps → Custom App (o Custom YAML, según el flujo de la instalación) y confirma que `traefik` refiere a la red existente. Publica únicamente el router HTTPS del frontend para `invoice.oarg.casa`; el túnel Cloudflare llega a Traefik en `https://traefik.oarg.casa/`. No crees una ruta pública al backend, MongoDB ni administración de Keycloak. Confirma la confianza del certificado y resolución del nombre desde el contenedor cloudflared. El worker de auditoría administrativa de Keycloak permanece optativo y no se habilita sin concederle por separado su rol mínimo.

## Liberación y actualización manual

1. Un PR dirigido a `main` ejecuta los checks desde runners hospedados. Solo un push aprobado a `main` publica `invoices-frontend`, `invoices-backend` e `invoices-workers` en Docker Hub con el SHA completo del commit. Define el secreto GitHub `DOCKERHUB_TOKEN` y las variables `DOCKERHUB_USERNAME` y `KEYCLOAK_WEB_CLIENT_ID`. La URL, realm y API base públicos se pasan como build args; no contienen credenciales. Las PR no publican.
2. Comprueba que las tres imágenes son públicas y descarga anónimamente los tags SHA. Registra esos tags junto al SHA y el resultado de CI.
3. En TrueNAS guarda/captura la definición YAML vigente. Cambia `IMAGE_TAG` a un SHA revisado en Apps → Custom App/YAML y aplica los cambios. No uses `latest`.
4. Espera que el backend responda `GET /api/health` con 200 y `GET /api/ready` con 200; revisa salud y logs de frontend y workers. Desde la ruta pública verifica HTTPS, CSP/cabeceras, login Keycloak, operación API y carga/lectura de imágenes.
5. Si falla una verificación, restaura el YAML anterior y el tag SHA anterior, reaplica y repite comprobaciones. Si hubo migración de datos incompatible, detén escrituras y restaura el respaldo según el plan antes de reabrirlas.

## Respaldo, restauración y reapertura de escrituras

Detén o pon en mantenimiento las escrituras de la app. Toma un respaldo consistente de MongoDB y del dataset de imágenes dentro de la misma ventana, registra fecha, tag de imágenes y resultado de cada respaldo, y confirma que los artefactos no están en el mismo fallo físico que los datos originales. La frecuencia, retención, destino, RPO y RTO son decisiones operativas pendientes.

En un entorno aislado restaura MongoDB y las imágenes, valida colecciones/índices, operaciones transaccionales, referencias entre registros y archivos, y login JWT. Reabre escrituras únicamente cuando todas las verificaciones de consistencia pasen y la app use la versión de imagen compatible. Documenta quién aprobó la reapertura. Conserva las guías de manejo/rotación en [runtime-secrets.md](runtime-secrets.md).

## Diagnóstico

- `/api/health` es liveness del proceso; no prueba Mongo ni Keycloak.
- `/api/ready` es readiness de Mongo y, si se configuró issuer/audience, disponibilidad de JWKS. HTTP 503 solo retira el backend del tráfico; no debería reiniciar el proceso.
- Revisa logs de API y workers desde Apps en TrueNAS. No copies secretos ni URI en tickets/logs.
- Revisa los logs de Traefik y cloudflared para confirmar la ruta `invoice.oarg.casa` → Traefik → frontend. `/api` debe ser proxied internamente por Nginx.
