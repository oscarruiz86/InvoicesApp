# Autenticación de Invoices App

La WebApp usa OIDC Authorization Code con PKCE S256 mediante `keycloak-js`; la API valida Access Tokens con `jose` y claves públicas JWKS. Keycloak administra contraseñas y sesión SSO. La aplicación no recibe contraseñas, no crea perfiles MongoDB y no implementa autorización organizacional.

## Preparación local

Copiar los ejemplos de entorno solo si no existen. `KC_BOOTSTRAP_ADMIN_USERNAME` identifica al usuario temporal que se crea solo para un volumen Keycloak nuevo. Guarda la contraseña de bootstrap y el secreto del cliente de perfiles en `secrets/keycloak-bootstrap-admin-password` y `secrets/keycloak-profile-init-client-secret`, respectivamente. El segundo debe ser aleatorio y URL-safe. `secrets/` está ignorado por Git; nunca pegues valores secretos en `.env`, argumentos de comandos, logs o archivos versionados.

```powershell
docker compose config --quiet
# Solo una vez y solo para un volumen Keycloak nuevo:
docker compose --profile keycloak-bootstrap run --rm keycloak-bootstrap
# Para un volumen existente, omite siempre el paso anterior y conserva sus datos.
docker compose up -d keycloak mongodb
docker compose --profile keycloak-migrate run --rm keycloak-profile-migrate
docker compose up -d keycloak-profile-init mongodb
```

En un volumen existente, copia la contraseña de la cuenta administrativa vigente a `secrets/keycloak-bootstrap-admin-password` con un editor y elimina `KC_BOOTSTRAP_ADMIN_PASSWORD` de `.env`. El servicio persistente arranca sin credenciales de bootstrap. Ejecuta `keycloak-profile-migrate` una vez: crea `invoices-profile-init`, asigna sus permisos y aplica el perfil sin reinicializar ni borrar el volumen. El proceso habitual usa únicamente el cliente de servicio. La migración no rota ni borra cuentas existentes.

El realm `invoices` se importa desde `keycloak/invoices-realm.json` y el servicio de inicialización aplica `keycloak/invoices-user-profile.json` mediante la API administrativa. El perfil habilita registro autónomo, usa el correo como nombre de usuario, impide que el usuario cambie ese correo y exige nombre, apellido, tipo de documento colombiano (`CC`, `CE`, `TI`, `RC`, `PA`, `PPT`) y número alfanumérico con guion de 3 a 20 caracteres. Abrir `http://localhost:8080`, acceder a la consola con los valores locales y preparar usuarios existentes cuando sea necesario. Las contraseñas se establecen únicamente en Keycloak. Asignar un rol de aplicación solo si corresponde. Ningún rol de aplicación se asigna por defecto; `/api/auth/me` acepta un usuario autenticado sin roles.

Los roles son `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN`, `DRIVER`. No hay jerarquía administrativa ni autorización de empresas, terceros o recursos implícita. La política backend reutilizable exige todos los roles solicitados; no se aplica un rol particular a `/me`.

### Invitaciones locales y notificaciones

El realm exige verificación de correo. SMTP está deshabilitado en el entorno local por defecto. La creación de invitaciones requiere la clave AES local de `NOTIFICATION_PAYLOAD_KEY_FILE`; el worker las marca suprimidas si SMTP está deshabilitado. Para configurar entrega real, sigue [notifications.md](notifications.md). Para preparar la cuenta receptora, registrar la cuenta en Keycloak, completar nombre y documento, y después abrir **Users**, seleccionar la cuenta y activar **Email verified**. Los fixtures aislados pueden crear directamente cuentas con `emailVerified: true`; esta excepción pertenece únicamente a preparación de pruebas y no existe en la API de la aplicación.

Abrir un enlace de invitación, iniciar sesión o volver del callback OIDC no cambia `Email verified`. Al aceptar, el backend consulta de nuevo el perfil actual mediante un cliente Keycloak de solo lectura y exige correo coincidente, `emailVerified: true` y perfil completo. Si la cuenta no está verificada, la aceptación falla; no se debe editar MongoDB, el token ni la invitación para evitar esa comprobación. Las credenciales y cualquier cambio de verificación se administran exclusivamente en Keycloak.

Para aplicaciones en host, iniciar `npm --prefix backend run dev` y `npm --prefix frontend run dev`. Para contenedores, usar `docker compose up --build -d --wait`; los volúmenes de dependencias de las aplicaciones deben actualizarse si ya existían antes de añadir `keycloak-js`/`jose`. Usar `docker compose run --rm --no-deps frontend npm ci` y el equivalente backend después de construir las imágenes y antes de iniciar las aplicaciones actualizadas. No eliminar volúmenes de datos.

## Variables y direcciones

| Variable | Ubicación / valor local | Uso |
| --- | --- | --- |
| `KEYCLOAK_PORT` | raíz: `8080` | Publicación en loopback; elegir otro puerto si está ocupado. |
| `KEYCLOAK_PUBLIC_URL` | raíz: `http://localhost:8080` | Hostname público completo de Keycloak. Sin barra final. |
| `INVOICES_WEB_ORIGIN` | raíz: `http://localhost:5173` | Origen exacto usado al importar las allowlists. Sin barra final. |
| `KC_BOOTSTRAP_ADMIN_USERNAME` | raíz: identificador temporal | Solo bootstrap de volumen nuevo y migración puntual; no se inyecta al servicio persistente. |
| `secrets/keycloak-bootstrap-admin-password`, `secrets/keycloak-profile-init-client-secret` | archivos locales ignorados | Solo lectura: bootstrap/migración e inicialización habitual del perfil. |
| `VITE_KEYCLOAK_URL` | frontend: `http://localhost:8080` | URL accesible al navegador. |
| `VITE_KEYCLOAK_REALM` | frontend: `invoices` | Realm público. |
| `VITE_KEYCLOAK_CLIENT_ID` | frontend: `invoices-web` | Cliente público, sin secreto. |
| `VITE_API_BASE_URL` | frontend: `/api` | API por proxy del mismo origen. |
| `API_PROXY_TARGET` | frontend host: `http://localhost:3000` | En Compose: `http://backend:3000`; no se publica. |
| `KEYCLOAK_ISSUER_URL` | backend: `http://localhost:8080/realms/invoices` | Coincidencia exacta con `iss`, también en Compose. |
| `KEYCLOAK_AUDIENCE` | backend: `invoices-api` | Audiencia exigida, distinta del ID de cliente frontend. |
| `KEYCLOAK_JWKS_URL` | backend host: opcional | Deriva `<issuer>/protocol/openid-connect/certs`; en Compose usa `http://keycloak:8080/realms/invoices/protocol/openid-connect/certs`. |

El grupo frontend es opcional para la página pública y obligatorio completo para login. Un grupo ausente/inválido no inventa sesión. Backend permite técnicos públicos sin identidad configurada; `/me` devuelve 503. Issuer y audiencia son obligatorios juntos; JWKS no puede configurarse solo. Configuración parcial invalida runtime como en foundations. URLs con credenciales, protocolos no HTTP(S) o HTTP fuera del ámbito local se rechazan; producción exige HTTPS.

Compose establece explícitamente las variables de identidad de las aplicaciones y esas entradas prevalecen sobre `env_file`. No copiar destinos Docker a `VITE_*`. Los valores Vite requieren reinicio o rebuild. Para construir el frontend estático autenticado, proporcionar `--build-arg VITE_KEYCLOAK_URL=...`, `--build-arg VITE_KEYCLOAK_REALM=...` y `--build-arg VITE_KEYCLOAK_CLIENT_ID=...`; son públicos.

Si 8080 está ocupado, por ejemplo elegir `KEYCLOAK_PORT=8181` y `KEYCLOAK_PUBLIC_URL=http://localhost:8181`; alinear las variables host frontend/backend. Si cambia el puerto/origen de la WebApp, alinear `FRONTEND_PORT`, `INVOICES_WEB_ORIGIN` y las allowlists del cliente. `localhost` y `127.0.0.1` son orígenes distintos.

## Cliente y ciclo de sesión

`invoices-web` es público, con Standard Flow y PKCE S256 obligatorio. Implicit Flow, Direct Access Grants y Service Accounts están deshabilitados. Se solicitan `openid profile email`; el scope por defecto `invoices-api-audience` añade `invoices-api` únicamente al Access Token. Realm roles se incluyen en `realm_access.roles`. El backend acepta solo los cuatro roles conocidos después de verificar el JWT.

El scope predeterminado `basic` incluye el mapper `oidc-sub-mapper` para emitir `sub` en el Access Token. Es necesario declararlo al importar esta configuración explícita de scopes; sin subject la API rechaza el token aunque su firma y audiencia sean válidas. [Mapper oficial de Keycloak](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/protocol/oidc/mappers/SubMapper.java).

La importación registra exactamente `${INVOICES_WEB_ORIGIN}/auth/callback`, post-logout `${INVOICES_WEB_ORIGIN}/` y ese Web Origin. El Home URL del cliente es `${INVOICES_WEB_ORIGIN}/login`; el enlace «Back to Application» de Keycloak abre la pantalla de autenticación de Invoices App. No hay comodines globales. Keycloak admite placeholders de entorno en la configuración importada; reiniciar no reimporta sobre un realm existente. [Importación oficial](https://www.keycloak.org/server/importExport).

`/` es pública y conserva health. `/login` muestra el mensaje de retorno de Keycloak y exige pulsar «Iniciar sesión»; el callback consume la respuesta antes del router y vuelve a `/session`. Si la cuenta autenticada no tiene contextos de organización, `/organizations/select` redirige a Mis invitaciones. State, nonce y PKCE se delegan al SDK; un callback no correlacionado muestra error. El destino final permitido es `/session`; no se aceptan retornos externos.

Access, Refresh e ID Token viven en memoria privada del adaptador, fuera de Zustand. La revisión del código instalado `keycloak-js 26.2.5` identifica almacenamiento `kc-callback-*` para correlación de un uso (state, nonce, verifier y redirect URI), con expiración de una hora y eliminación al consumirlo; no contiene tokens. El SDK limpia entradas vencidas al acceder al almacenamiento. La aplicación solo añade un marcador transitorio de logout con state y vencimiento, sin credenciales. Una recarga pierde tokens y vuelve a autenticar mediante redirección de primer nivel; no depende de silent SSO ni cookies de terceros.

Antes de enviar una solicitud, el adaptador renueva si quedan menos de 30 segundos y comparte una sola renovación concurrente. También atiende expiración. El límite OIDC es 10 segundos y HTTP 5 segundos. Si falla refresh o el backend devuelve 401, se borra sesión y se ofrece login explícito. Una respuesta tardía de refresh/logout no reactiva sesión. Errores de red/5xx en `/me` muestran reintento, sin bucles de login ni afirmar sesión API activa.

Logout elimina acceso local inmediatamente y navega al cierre Keycloak. Un state de logout correlaciona el retorno. Si no se confirma, el estado local sigue cerrado y se informa el cierre remoto pendiente. Un JWT copiado puede seguir siendo aceptado hasta expirar: vida local configurada de 5 minutos más tolerancia de reloj de 30 segundos. No se hace introspección por petición ni revocación instantánea propia.

## API y Swagger

`GET /api/auth/me` requiere un único `Authorization: Bearer <access_token>` y devuelve `user` con `id`, `username`, `name`, `email` y `roles`; atributos opcionales ausentes son null. Nunca incluye tokens o claims completos. No requiere MongoDB ni consulta UserInfo.

El verificador exige RS256, firma JWKS, issuer exacto, audiencia, exp y sub; valida nbf si aparece y payload `typ=Bearer`. ID/Refresh Tokens se rechazan. JWKS se comparte por proceso, caché máxima 10 minutos, timeout 5 segundos y cooldown 30 segundos; URLs jku/x5u del token se ignoran. Durante una caída se puede usar una clave vigente en caché; sin clave verificable se deniega con 401 y un intento posterior puede recuperarse. Solo se registran categorías técnicas, nunca JWT o respuestas del proveedor.

| HTTP | Significado |
| --- | --- |
| 200 | Perfil confirmado por la API. |
| 401 `UNAUTHENTICATED` | Bearer ausente, inválido o no verificable; incluye `WWW-Authenticate: Bearer`. |
| 503 `CONFIGURATION_ERROR` | Identidad no configurada o configuración inválida; precede a la evaluación de credenciales. |
| 500 `INTERNAL_ERROR` | Fallo inesperado sin detalles privados. |

Todas las respuestas llevan `Cache-Control: no-store`. Health, OpenAPI y Swagger siguen públicos. Abrir `/api/docs` en 3000 o a través de 5173. Para una prueba autenticada de desarrollo, iniciar sesión normalmente y copiar temporalmente el Bearer de una solicitud propia a `/api/auth/me` desde Network en las herramientas del navegador; pegar solo el Access Token en Authorize y ejecutar Try it out. Eliminarlo al terminar; no pegarlo en archivos, capturas o incidencias. Swagger usa `persistAuthorization:false`, por lo que recargar borra autorización. Sin token debe devolver 401 con configuración válida.

## Pruebas y datos aislados

`npm --prefix backend run check` y el equivalente frontend usan puertos, claves generadas y JWKS de prueba; no necesitan servicios externos. OpenAPI se valida con `npm --prefix backend run openapi:lint`. Builds no contactan Keycloak/MongoDB. El frontend prueba guard, estado, transporte, timeout, cancelación, refresh concurrente y limpieza.

```powershell
node scripts/test-keycloak.mjs
node scripts/test-authentication.mjs
```

La primera prueba levanta un contenedor aislado con puerto libre y administrador efímero; importa un realm `invoices-auth-test-*`, crea usuario efímero, comprueba configuración y flujos prohibidos y reinicia para verificar persistencia. El fixture recibe las credenciales de bootstrap por entorno del proceso y las genera en memoria; no se escriben en JSON o logs. La limpieza elimina únicamente sus recursos temporales. No toca usuarios del realm `invoices`.

La segunda prueba ejecuta el recorrido completo con navegador y API, en host y Compose. Usa los mismos principios de aislamiento y desactiva trazas/capturas con credenciales. Las pruebas específicas de expiración modifican solo el realm efímero. Los resultados efectivos se registran en `docs/verification.md`; disponer de los scripts no acredita que ya se hayan ejecutado.

Se puede seleccionar un entorno con `--mode=host` o `--mode=compose`. Instalar antes Chromium con `npm --prefix frontend exec -- playwright install chromium`. La prueba host necesita disponer de la caché de Next del proyecto: no ejecutarla junto a otro Next host del mismo backend. Si Windows informa `EPERM` sobre `backend/.next/dev`, detener esos procesos y retirar únicamente esa caché generada antes de repetir; no borrar código ni volúmenes de datos.

## Operación y límites

Keycloak usa `start-dev`, almacenamiento local persistente y puertos loopback. Este Compose no es una configuración productiva; fuera del desarrollo local usar HTTPS y una configuración operativa específica. `docker compose down` conserva datos. Para actualizar el realm existente, revisar y aplicar cambios explícitos desde la consola/admin API después de respaldar de forma adecuada; no borrar volúmenes ni importar con sobrescritura como rutina.

La autorización de recursos, empresas, terceros, facturas y conductores requiere cambios posteriores. La UI y Zustand no conceden permisos; la API verifica cada solicitud protegida. No existe login personalizado ni almacenamiento de passwords en MongoDB.
