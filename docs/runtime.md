# Runtime técnico

El backend contiene Route Handlers técnicos, autenticación protegida y operaciones REST de empresas, terceros, invitaciones y memberships. La WebApp React/Vite contiene las pantallas administrativas. No hay login propio ni sesión backend.

| Variable backend | Validación |
| --- | --- |
| NODE_ENV | development, test o production; development por defecto. |
| MONGODB_URI | Requerida; URI mongodb o mongodb+srv con host, sin abrir conexión al validar. |
| KEYCLOAK_ISSUER_URL | URL opcional; requiere también audiencia si se suministra. |
| KEYCLOAK_AUDIENCE | Texto no vacío opcional; requiere también issuer. |
| KEYCLOAK_JWKS_URL | Override opcional de conexión; requiere issuer/audiencia. Sin él se deriva la URL de claves del issuer. |

El bootstrap valida runtime antes de cada servicio técnico. Configuración inválida devuelve HTTP 503 con `error.code=CONFIGURATION_ERROR`; el diagnóstico interno identifica únicamente los nombres de variables inválidas. Los fallos inesperados devuelven HTTP 500, `INTERNAL_ERROR`, sin stack ni mensaje original. La compilación no abre conexiones ni requiere credenciales.

`GET /api/health` devuelve JSON `{ "status": "ok" }` y `Cache-Control: no-store` con configuración válida. Es liveness: funciona con MongoDB/Keycloak caídos y no acredita preparación de persistencia. `GET /api/openapi` publica el contrato único `backend/openapi/openapi.json` (3.1.0). `/api/docs` sirve documentación Swagger y assets locales; no es una página de producto Next.js.

`GET /api/ready` es la señal separada de readiness. Verifica conexión MongoDB con límite de 4 s y JWKS con límite de 3.5 s cuando issuer/audience están configurados; responde únicamente `{ "status": "ready" }` (200) o `{ "status": "not_ready" }` (503), sin detalles de dependencias. Se usa para retirar instancias temporalmente del tráfico, nunca para reiniciarlas. En perfiles sin identidad configurada, solo MongoDB es requerido. El endpoint no es una prueba de escritura ni de todas las rutas externas.

La conexión MongoDB es perezosa, comparte promesa/pool por proceso y sobrevive a hot reload mediante un cache global técnico. Timeout de selección/conexión: 3000 ms; pool máximo: 10. Un intento rechazado limpia su estado y permite recuperarse. No se cierra por solicitud. `closeMongo` se usa para cierre explícito y limpieza de pruebas. Organizations, identidad, invitaciones y notificaciones tienen adaptadores MongoDB propios; sus sesiones y modelos no escapan a Infrastructure.

`IdentityVerifier` conecta el adaptador JWT/JWKS en bootstrap. Configuración completa activa validación perezosa en rutas protegidas; ausencia permite técnicos públicos pero `/api/auth/me` responde 503. Configuración parcial se rechaza. No hay identidades ficticias. Las URLs deben ser HTTP local o HTTPS, sin credenciales embebidas; producción exige HTTPS.

`GET /api/auth/me` entrega un perfil mínimo de claims verificados, sin consultar MongoDB: `user.id` corresponde a subject; `username`, `name`, `email` pueden ser null; `roles` contiene únicamente roles conocidos. Firma RS256, issuer, audience, exp/sub obligatorios, nbf y tipo Bearer se validan en infraestructura. Un Bearer ausente, inválido o no verificable devuelve 401 `UNAUTHENTICATED`, `WWW-Authenticate: Bearer` y no-store. La política reutilizable de roles puede traducir ausencia de rol a 403; `/me` no exige ningún rol. Errores inesperados conservan 500.

JWKS se comparte por proceso con caché máxima de 10 minutos, timeout de 5 segundos y cooldown de 30 segundos para nuevas claves. Sin clave utilizable se deniega acceso y la resolución puede recuperarse. No se consulta ninguna URL del JWT ni se registran tokens/claims. [Configuración, Swagger y operación](authentication.md) detalla direcciones host/Compose, audiencia, roles y errores.

Pruebas unitarias: `npm --prefix backend test`. Integración: proporcionar `MONGODB_TEST_URI` a una base terminada en `_test` y ejecutar `npm --prefix backend run test:integration`. Para el Compose local, publica `127.0.0.1:27019` y usa `?replicaSet=invoices-rs&directConnection=true`; la conexión directa evita seguir el hostname interno `mongodb` fuera de Compose. Para ejecutar únicamente los flujos de terceros usa desde `backend`: `npx vitest run --config vitest.integration.config.ts tests/integration/third-party-management.test.ts`. La suite de terceros crea una base aleatoria terminada en `_test`, prueba transacciones y elimina solo esa base aislada al finalizar. La suite de directorio requiere sus credenciales Keycloak efímeras. `test:http`, después de build, levanta procesos Next aislados en puertos libres y los cierra al terminar. `TEST_API_BASE_URL` permite comprobar además un backend ya iniciado.

Las operaciones de terceros requieren un replica set escribible. El perfil canónico y la proyección organizacional se actualizan en una transacción; no hay fallback no transaccional. `third-party-readiness.ts` añade únicamente `revision`, `updatedAt` y `mutationFence` faltantes a relaciones legadas. `npm --prefix backend run third-parties:inventory-legacy` guarda un inventario idempotente de organizaciones THIRD_PARTY sin perfil; no crea NIT, correo, perfiles ni relaciones.
