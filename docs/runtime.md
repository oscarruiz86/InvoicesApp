# Runtime técnico

El backend contiene Route Handlers técnicos y `GET /api/auth/me` protegido. No hay páginas de producto, login propio, sesiones backend ni operaciones de negocio.

| Variable backend | Validación |
| --- | --- |
| NODE_ENV | development, test o production; development por defecto. |
| MONGODB_URI | Requerida; URI mongodb o mongodb+srv con host, sin abrir conexión al validar. |
| KEYCLOAK_ISSUER_URL | URL opcional; requiere también audiencia si se suministra. |
| KEYCLOAK_AUDIENCE | Texto no vacío opcional; requiere también issuer. |
| KEYCLOAK_JWKS_URL | Override opcional de conexión; requiere issuer/audiencia. Sin él se deriva la URL de claves del issuer. |

El bootstrap valida runtime antes de cada servicio técnico. Configuración inválida devuelve HTTP 503 con `error.code=CONFIGURATION_ERROR`; el diagnóstico interno identifica únicamente los nombres de variables inválidas. Los fallos inesperados devuelven HTTP 500, `INTERNAL_ERROR`, sin stack ni mensaje original. La compilación no abre conexiones ni requiere credenciales.

`GET /api/health` devuelve JSON `{ "status": "ok" }` y `Cache-Control: no-store` con configuración válida. Es liveness: funciona con MongoDB/Keycloak caídos y no acredita preparación de persistencia. `GET /api/openapi` publica el contrato único `backend/openapi/openapi.json` (3.1.0). `/api/docs` sirve documentación Swagger y assets locales; no es una página de producto Next.js.

La conexión MongoDB es perezosa, comparte promesa/pool por proceso y sobrevive a hot reload mediante un cache global técnico. Timeout de selección/conexión: 3000 ms; pool máximo: 10. Un intento rechazado limpia su estado y permite recuperarse. No se cierra por solicitud. `closeMongo` se usa para cierre explícito y limpieza de pruebas. No existen modelos Mongoose ni repositorios de negocio.

`IdentityVerifier` conecta el adaptador JWT/JWKS en bootstrap. Configuración completa activa validación perezosa en rutas protegidas; ausencia permite técnicos públicos pero `/api/auth/me` responde 503. Configuración parcial se rechaza. No hay identidades ficticias. Las URLs deben ser HTTP local o HTTPS, sin credenciales embebidas; producción exige HTTPS.

`GET /api/auth/me` entrega un perfil mínimo de claims verificados, sin consultar MongoDB: `user.id` corresponde a subject; `username`, `name`, `email` pueden ser null; `roles` contiene únicamente roles conocidos. Firma RS256, issuer, audience, exp/sub obligatorios, nbf y tipo Bearer se validan en infraestructura. Un Bearer ausente, inválido o no verificable devuelve 401 `UNAUTHENTICATED`, `WWW-Authenticate: Bearer` y no-store. La política reutilizable de roles puede traducir ausencia de rol a 403; `/me` no exige ningún rol. Errores inesperados conservan 500.

JWKS se comparte por proceso con caché máxima de 10 minutos, timeout de 5 segundos y cooldown de 30 segundos para nuevas claves. Sin clave utilizable se deniega acceso y la resolución puede recuperarse. No se consulta ninguna URL del JWT ni se registran tokens/claims. [Configuración, Swagger y operación](authentication.md) detalla direcciones host/Compose, audiencia, roles y errores.

Pruebas unitarias: `npm --prefix backend test`. Integración: proporcionar `MONGODB_TEST_URI` a una base terminada en `_test` y ejecutar `npm --prefix backend run test:integration`. Las pruebas de datos hacen ping, reutilización y recuperación; no escriben modelos de negocio. `test:http`, después de build, levanta procesos Next aislados en puertos libres y los cierra al terminar. `TEST_API_BASE_URL` permite comprobar además un backend ya iniciado.
