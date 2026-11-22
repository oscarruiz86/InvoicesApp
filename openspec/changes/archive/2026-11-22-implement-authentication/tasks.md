# Tasks

La implementación fue solicitada explícitamente mediante `openspec-apply-change implement-authentication`. Cada casilla se completa después de implementar y verificar su comportamiento. Las referencias de capacidad corresponden a `specs/<capacidad>/spec.md` dentro de este cambio; el enfoque está en `design.md`. No ejecutar CRUD, autorización organizacional completa ni despliegues.

## 1. Contratos y límites arquitectónicos

- [x] 1.1 Definir los puertos específicos y tipos puros de autenticación en `frontend/src/modules/authentication` y evolucionar `IdentityVerifier`/actor en `backend/src/modules/identity` conforme a design §1; verificar casos de uso con dobles compatibles sin HTTP, SDK o MongoDB. Referencia: identity-access, «Identidad validada mediante un contrato sustituible».
- [x] 1.2 Extender reglas y ejemplos negativos de arquitectura para impedir `keycloak-js` y `jose` en Domain/Application y adaptadores concretos en Presentation; verificar `npm --prefix frontend run test:architecture` y su equivalente backend, incluidos ciclos e imports por alias. Actualizar `docs/architecture.md` con responsabilidades y puntos de composición.
- [x] 1.3 Fijar versiones compatibles de `keycloak-js`, `jose` e imagen Keycloak en manifiestos/lockfiles independientes y matrices existentes, documentando fuentes oficiales; verificar instalación reproducible y compatibilidad con Node/TypeScript del proyecto sin actualizar dependencias ajenas al alcance.

## 2. Keycloak y configuración local

- [x] 2.1 Crear configuración importable de realm `invoices`, cliente público `invoices-web`, PKCE S256 obligatorio, allowlists exactas, roles sin asignación por defecto y mapper `invoices-api` solo para Access Token; verificar importación en instancia aislada y rechazo de password grant, implícito, PKCE inválido y redirect no registrado. Documentar ajustes en `docs/authentication.md`. Referencia: identity-access, realm, destinos y audiencia.
- [x] 2.2 Incorporar servicio Keycloak de desarrollo a `compose.yaml` con imagen fijada, hostname público, puerto loopback y volumen persistente, sin credenciales en archivos versionables; verificar `docker compose config --quiet`, arranque y reinicio conservando datos, sin eliminar volúmenes. Documentar bootstrap local e importación inicial frente a actualización de un realm existente.
- [x] 2.3 Extender configuración validada y ejemplos frontend/backend/raíz con las variables de design §7; verificar unitarias de grupo ausente, parcial, completo, URLs inválidas y ausencia de filtración de secretos, más igualdad de issuer host/Compose con JWKS interno separado. Documentar precedencia de variables y cambios de origen/puerto en README. Referencias: frontend-shell, backend-runtime y local-development.
- [x] 2.4 Preparar fixture de realm de pruebas aislado y suministro externo de usuarios/credenciales efímeros sin modificar usuarios de desarrollo; verificar creación/limpieza acotada y que importación, ejemplos y registros no contengan passwords, tokens ni claves privadas. Documentar ejecución de las pruebas reales y limitación HTTP a desarrollo local.

## 3. Verificación de identidad y autorización preparada

- [x] 3.1 Implementar el adaptador backend con `jose` detrás de `IdentityVerifier`, validando RS256, issuer, audience cadena/arreglo, exp requerido, nbf, subject y tipo Access Token; verificar unitarias con claves generadas en ejecución para éxito y rechazo por cada condición, incluyendo firma alterada, HS256/none e ID/Refresh Token. Referencia: identity-access, «Validación criptográfica del Access Token».
- [x] 3.2 Implementar resolución JWKS reutilizable con caché, timeout, cooldown y recuperación de design §5; verificar mediante servidor JWKS de prueba rotación, clave desconocida, caída con/sin caché, recuperación y que jku/x5u no causen solicitudes a destinos externos. Documentar diagnóstico sin tokens y semántica de 401 ante identidad no verificable.
- [x] 3.3 Mapear claims verificados a actor y añadir política de roles reutilizable sin organizaciones ni jerarquías; verificar usuario sin roles, los cuatro roles conocidos, duplicados/desconocidos y rechazo de roles suministrados por el cliente. Probar categoría de autorización/403 usando un handler de prueba, sin publicar endpoints adicionales. Referencia: identity-access, «Roles generales sin autorización organizacional implícita».

## 4. Endpoint protegido y Swagger

- [x] 4.1 Crear wrapper de autenticación y composición en bootstrap con runtime Node.js; verificar extracción de un único Bearer, ausencia/malformación/duplicación, ignorar tokens en cookie/query/body y no ejecutar el caso de uso al fallar. Comprobar envelope 401, WWW-Authenticate y no-store, y precedencia de configuración 503. Referencias: identity-access y backend-runtime.
- [x] 4.2 Implementar caso de uso y `GET /api/auth/me` con DTO de design §6; verificar 200 con perfil completo/parcial y roles vacíos, ausencia de tokens/claims extra, 401/503/500 y cero llamadas a MongoDB. Actualizar `docs/runtime.md` con activación real, rutas públicas y errores.
- [x] 4.3 Extender `backend/openapi/openapi.json` con bearerAuth y respuestas/esquemas/headers de `/api/auth/me`; verificar `npm --prefix backend run openapi:lint` y pruebas HTTP que contrasten respuestas reales con el contrato, conservando salud y documentación sin autenticación.
- [x] 4.4 Configurar Swagger sin persistencia de autorización y documentar obtención temporal de un Access Token propio para Authorize; verificar Try it out con 200/401, limpieza al recargar, assets locales y funcionamiento tanto directo como por proxy. No guardar tokens en documentación o evidencias.

## 5. Adaptadores frontend y ciclo de tokens

- [x] 5.1 Implementar adaptador `keycloak-js` e inicialización única de design §3 con login explícito y callback correlacionado; verificar PKCE S256, state/nonce incorrectos, cancelación, limpieza de URL, doble inicialización y retorno externo rechazado mediante pruebas del adaptador. Documentar responsabilidades y recarga SSO en `docs/frontend.md`.
- [x] 5.2 Mantener tokens solo en memoria privada del adaptador y datos transitorios OIDC de uso único con expiración; verificar que localStorage/sessionStorage/IndexedDB/cookies propias, stores serializados y logs no contienen Access/Refresh/ID Token. Auditar y documentar el comportamiento de almacenamiento de la versión SDK fijada. Referencia: frontend-shell, «Credenciales únicamente en memoria».
- [x] 5.3 Implementar renovación coordinada y límites temporales de design §4; verificar con reloj controlado una única renovación concurrente, uso del token actualizado, rechazo/timeout, suspensión y retorno de la pestaña, y descarte de respuestas tardías tras logout o invalidación.
- [x] 5.4 Añadir transporte protegido y adaptador de `/api/auth/me` conservando cliente público de health; verificar Bearer solo hacia la API configurada, rechazo de redirecciones, cancelación/timeout, DTO inválido, 401 que invalida sesión y red/503 que permiten reintento sin bucles. Documentar categorías de error.
- [x] 5.5 Implementar cierre local inmediato y logout Keycloak con retorno permitido; verificar cancelación de solicitudes/renovación en curso, eliminación de perfil/tokens, éxito remoto y fallo que mantiene cierre local sin afirmar cierre SSO. Documentar limitación de revocación de JWT ya emitidos.

## 6. Estado y navegación autenticada

- [x] 6.1 Crear store Zustand no persistido y casos de uso para inicializar, login, logout y consultar perfil, conectados desde `frontend/src/app`; verificar todos los estados de design §3 y que ningún estado ni acción serializada contiene tokens o SDK. Referencia: frontend-shell, «Estado observable de autenticación».
- [x] 6.2 Incorporar `/auth/callback`, guard y `/session`, manteniendo inicio público y fallback; verificar carga antes de decidir, redirección única por intento, contenido privado oculto al anónimo, recuperación explícita de errores y nueva autenticación tras recarga sin tokens persistidos.
- [x] 6.3 Añadir acciones de login/logout y vista responsive de sesión con perfil confirmado por `/me`; verificar carga, 200, 401, error de red/503 y reintento, además de 360/1280 px y regresiones de health/ruta desconocida. Actualizar `docs/frontend.md` y README con las rutas y comportamiento observado.

## 7. Aceptación integrada del incremento

- [x] 7.1 Ejecutar y registrar `npm --prefix frontend run check`, `npm --prefix backend run check`, ambos builds y lint OpenAPI sin MongoDB/Keycloak activos; verificar que no se hacen conexiones externas y se conservan las restricciones arquitectónicas. Referencia: local-development, «Validaciones reproducibles y separadas».
- [x] 7.2 Ejecutar pruebas HTTP contra backend real, incluyendo 200 autenticado, 401 sin token y rechazo criptográfico, Swagger y health con proveedor caído; verificar que el contrato y las rutas públicas coinciden con las specs sin introducir CRUD.
- [x] 7.3 Automatizar y ejecutar con Playwright y Keycloak real los diez pasos de design §8 en host y Compose; verificar issuer/audience, Bearer a `/me`, perfil confirmado, recarga SSO, renovación, logout y nuevo acceso privado. Mantener realm/usuarios aislados y evidencias sin credenciales ni trazas sensibles.
- [x] 7.4 Ejecutar aceptación de fallos integrada: callback cancelado, expiración no renovable, indisponibilidad Keycloak y recuperación, token incorrecto enviado directamente a API y Swagger sin autorización; verificar que nunca se muestra sesión API activa sin confirmación ni se concede acceso desde estado frontend manipulado.
- [x] 7.5 Recorrer README y `docs/authentication.md` en un entorno de prueba limpio, registrar resultados en `docs/verification.md` y comprobar alcance final: solo autenticación, sin passwords en MongoDB, secretos versionables, autorización organizacional, cambios a tareas base o despliegues.

## Workflow follow-up

- La sincronización y el archivo no se ejecutan durante esta propuesta. En el cierre autorizado posterior, reconciliar deltas con cualquier cambio concurrente, actualizar el Purpose histórico de backend-runtime como indica design y comprobar compatibilidad con la futura delta identity-access de initial-invoices-app.
