# Shell frontend

La aplicación utiliza un tema Material UI global y React Router declarativo para `/`, callback OIDC `/auth/callback`, ruta privada `/session` y ruta no encontrada. El inicio presenta estado de API y acciones de sesión; no habilita pantallas de negocio. Zustand administra estado de UI y perfil sin persistir tokens ni conceder permisos.

`VITE_API_BASE_URL` es pública: `/api` por defecto o URL HTTP(S) sin credenciales. La configuración inválida muestra un mensaje antes de comunicar. `API_PROXY_TARGET` pertenece únicamente al servidor Vite: localhost:3000 en host, backend:3000 en Compose. Los proxies preservan `/api` y `/docs-assets/`; el navegador no usa nombres de Docker.

La composición inyecta un puerto de consulta de salud en el caso de uso; su adaptador valida el JSON con Zod y usa un cliente fetch común. El cliente tiene timeout de 5000 ms y cancelación. Distingue NETWORK, TIMEOUT, CANCELLED, HTTP e INVALID_RESPONSE. Presentation convierte esas categorías en mensajes comunes, sin mostrar cuerpos HTTP ni mensajes internos. El límite de errores cubre fallos de render; los errores asíncronos recorren el store. El reintento es explícito y los resultados obsoletos no sobrescriben solicitudes nuevas.

`npm --prefix frontend run check` ejecuta lint, tipos, unitarias y arquitectura sin API ni base de datos. Playwright verifica layout a 360 y 1280 px, recarga de rutas, fallo/recuperación y API/Swagger reales por proxy. El backend debe estar iniciado para la prueba integrada; las pruebas puras sustituyen el puerto o el transporte.

El módulo authentication separa SessionPort, AccessTokenPort y CurrentUserPort. `keycloak-js` solo vive en infraestructura; la composición instancia el adaptador una vez e inicializa antes del router. State/nonce/PKCE, callback y código se procesan sin exponer credenciales en Zustand. El grupo `VITE_KEYCLOAK_*` es público; ausente o inválido conserva el shell y muestra configuración pendiente para autenticación.

La ruta privada espera inicialización, redirige una sola vez al anónimo y vuelve a `/session`. La recarga hace un nuevo flujo OIDC de primer nivel; no restaura tokens del almacenamiento. El estado OIDC y el estado del perfil son separados: «Sesión activa» solo aparece tras `/api/auth/me` 200 válido. Errores de red/503 permiten reintentar; 401 invalida sesión y ofrece login explícito.

Tokens solo en memoria privada del SDK. Renovación compartida cuando quedan menos de 30 segundos y al expirar, timeout OIDC de 10 segundos. El transporte de perfil fija `/api/auth/me`, obtiene Bearer al enviar, omite cookies y rechaza redirects; no añade credenciales al cliente público de health. Cancelación, timeout HTTP de 5 segundos y descarte de resultados tardíos impiden reactivar perfil tras logout. UNAUTHENTICATED se distingue de NETWORK, HTTP y respuesta malformada.

Logout limpia estado local, solicita cierre Keycloak y correlaciona el retorno mediante un marcador temporal sin credenciales. Si falla, informa cierre remoto no confirmado. [Autenticación](authentication.md) documenta almacenamiento transitorio del SDK, pruebas aisladas y límites de revocación.
