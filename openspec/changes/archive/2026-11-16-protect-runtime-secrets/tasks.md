# Tasks

Cada tarea se completa al implementar y verificar el comportamiento. No reemplazar ni rotar credenciales reales; las pruebas usan valores ficticios y servicios aislados.

## 1. Contratos y configuración común

- [x] 1.1 Auditar credenciales y salidas observables en backend, Compose, Keycloak, Mongo, `kcadm`, imágenes, configuración del contenedor, procesos y logs; registrar campos sensibles y configuración pública permitida.
- [x] 1.2 Mover el puerto y lector de archivos desde Notifications a infraestructura compartida sin violar dependency-cruiser; definir límites de tamaño, UTF-8, terminadores, espacios significativos y errores genéricos.
- [x] 1.3 Extender configuración con referencias `_FILE`, rechazar colisiones plano/archivo en producción y conservar solo la URI Mongo local sin credenciales inline; añadir pruebas de validación y sanitización.

## 2. MongoDB y arranques del backend

- [x] 2.1 Cambiar el gestor de conexiones para resolver `MONGODB_URI_FILE` antes de crear el pool sin cargar el valor en `process.env`; adaptar todos los puntos de composición de API.
- [x] 2.2 Adaptar el arranque Next standalone de producción y el worker para usar paths de secreto sin copiar la URI a variables de entorno.
- [x] 2.3 Probar conexión Mongo con URI de archivo; la simulación confirma ausencia de la URI en entorno/configuración/argumentos, logs y métricas, y la integración cubre error/recuperación.
- [x] 2.4 Actualizar Compose y ejemplos para montar URI productiva en solo lectura y mantener la URI local sin autenticación en desarrollo.

## 3. Credenciales y procesos Keycloak

- [x] 3.1 Inyectar `KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE` mediante el lector común en lectores de administración/perfil; adaptar contratos asíncronos y probar archivo válido/ausente.
- [x] 3.2 Separar el bootstrap de una ejecución del servicio persistente; quitar el password de `.env`, crear el secreto local ignorado y migrar el realm existente conservando su volumen `invoices-foundations_keycloak-data`.
- [x] 3.3 Crear `invoices-profile-init` como cliente de servicio; limitar roles a `manage-realm`, `manage-clients`, `view-clients`, `query-clients` y asignar el scope `kc-admin-api` necesario en Keycloak 26.8.2.
- [x] 3.4 Guardar las sesiones de `kcadm` bajo `/run/kcadm` (`tmpfs`) y eliminarlas al terminar; comprobar el flujo en el contenedor temporal.
- [x] 3.5 Probar bootstrap, migración, inicialización del perfil, permisos del cliente, rechazo de acceso al realm `master`, preservación de usuario y ausencia de secretos en configuración persistente/logs; repetir `keycloak-profile-init` contra el volumen actual.

## 4. Migración, rotación y rollback

- [x] 4.1 Documentar la rotación de Mongo, cliente de directorio, cuenta de servicio y bootstrap admin, distinguiendo el archivo de la credencial vigente en Keycloak.
- [x] 4.2 Documentar y validar rollback entre imágenes compatibles con archivos; la prueba usa dos tags fixture del mismo digest Keycloak 26.8.2, confirma bootstrap por archivo, cambio real de imagen, preservación del volumen/usuario y ausencia del secreto en configuración/logs.
- [x] 4.3 Auditar `.gitignore` y ejemplos con `git check-ignore`; modificar reglas solo si se detectan huecos y mantener versionables las plantillas seguras.
- [x] 4.4 Lint, typecheck, 330 unitarias, arquitectura, build, HTTP, Mongo aislado y prueba integral Keycloak pasan; la migración conserva un usuario preexistente y valida el volumen actual.
- [x] 4.5 Registrar la decisión de aplazar los ensayos de preproducción; se retomarán en un entorno productivo simulado futuro.

## Retomación futura

El entorno aislado `runtime-secrets-003cf953` sigue detenido con sus datos conservados. La simulación productiva temporal de Mongo/worker pasó y limpió sus recursos efímeros. La migración Keycloak local se ejecutó en el volumen existente y preservó sus datos; la prueba de rollback entre imágenes compatibles pasó sobre su propio volumen efímero. Las pruebas de entorno productivo real siguen aplazadas conforme a 4.5.
