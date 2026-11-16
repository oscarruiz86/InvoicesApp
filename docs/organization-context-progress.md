# Evidencia de contexto organizacional

Implementación autorizada mediante `openspec-apply-change implement-organization-context`. No incluye CRUD, despliegue, archivo, nuevos permisos ni completar cambios ajenos. Las casillas de OpenSpec se marcan solo con comportamiento y verificación correspondientes.

## Verificación ejecutada

- Backend: check (lint, TypeScript, 256 pruebas unitarias y arquitectura) correcto. Build independiente y OpenAPI correctos; ambas rutas nuevas aparecen en el build.
- Regresión HTTP real `npm --prefix backend run test:http`: correcta; health, OpenAPI, Swagger/assets, configuración inválida, JWT y rechazo/indisponibilidad organizacional preservados.
- Regresión de autenticación `node scripts/test-authentication.mjs --mode=host`: correcta con la navegación actual al selector; OIDC/API, perfil, SSO, renovación automática, Swagger directo/proxy, logout, refresh rechazado, caída y recuperación de Keycloak, JWT en caché, cancelación de callback y error/reintento de API. Recursos temporales eliminados al terminar.
- Revisión final y `openspec validate implement-organization-context --strict --no-interactive`: correctas. Sin CRUD, permisos nuevos, instalación de dependencias ni modificaciones de Keycloak funcional ajenas al cambio. Progreso: 39/41 tareas; solo 13.1–13.2 pendientes de proveedores reales.
- MongoDB real: 4 pruebas de integración correctas en bases aleatorias `_test`; incluyen índices, relaciones, capacidad incompatible rechazada, lectura que no converge, revocación, captura durable e idempotencia de eventos.
- Frontend: check completo correcto (lint, TypeScript, 67 pruebas y arquitectura); incluye 12 pruebas nuevas de contexto. Build correcto. Estado, preferencia, API, guards, confirmación de descarte y respuestas tardías comprobados. El build advierte un chunk de aproximadamente 564 kB, sin impedir compilación.
- Aceptación real correcta mediante `node scripts/test-organization-context.mjs`: Keycloak efímero, MongoDB, REST y Playwright; cero/uno/varios destinos, GLOBAL, empresas/terceros, cambios sin login, recarga, revocación, política modificada durante sesión, preferencia manipulada, dos pestañas independientes y pestaña duplicada revalidada, logout, expiración y Swagger Try it out para ambos endpoints. Utiliza un contenedor efímero propio y una base MongoDB aleatoria propia, y los elimina al terminar. No imprime credenciales ni persiste trazas con tokens.
- Capturas `../.artifacts/organization-context/selector-360.png` y `selector-1280.png` revisadas: sin scroll horizontal, tarjetas legibles y controles táctiles de 44 px. Se verificaron teclado, foco y árbol accesible; no equivale a una auditoría exhaustiva con todas las combinaciones de lector de pantalla/navegador.
- El primer intento de navegador sufrió timeout al compilar rutas Next dev por primera vez. El harness precalienta handlers con solicitudes sin credenciales (401) para separar compilación de la latencia real del transporte. Se conserva el timeout de producción y la recuperación explícita de UI. La regresión HTTP encontró EPERM al regenerar `.next/dev` dentro del sandbox de Windows; se ejecuta con los permisos necesarios para esa caché local. Las suites con Next se ejecutan secuencialmente y con webpack en los fixtures.

## Matriz de los 22 casos

| Caso | Evidencia disponible |
| --- | --- |
| 1 Una empresa | Unitarias y navegador real: autoselección después de confirmar identidad. |
| 2 Varias empresas | Navegador real: elección explícita y cambio entre empresas; API: separación de capacidades. |
| 3 Un tercero | Unitarias y navegador real: autoselección con THIRD_PARTY; MongoDB: grant DRIVER local. |
| 4 Varios terceros | Descubrimiento, selección y cambio verificados con navegador/API/MongoDB reales. |
| 5 Múltiples roles | Política real en unitarias: COMPANY_ADMIN en empresa, DRIVER en tercero; roles del destino filtrados. |
| 6 Tipos diferentes | API/casos de uso devuelven destinos distintos y scopes exactos. |
| 7 Administrador global | GLOBAL explícito, sin organizaciones inferidas, comprobado con política y login reales. |
| 8 Sin asociaciones | 200 vacío con persistencia real; estado vacío frontend, sin bucle. |
| 9 Organización inactiva | MongoDB real y unitarias excluyen/rechazan destino. |
| 10 Asociación desactivada | MongoDB real rechaza restauración; frontend limpia al recibir rechazo de permisos. |
| 11 Organización ajena | Backend rechaza sin nombres ni IDs en auditoría de denegación. |
| 12 Cambio de empresa | Navegador real cambia contexto y permisos sin nuevo login. |
| 13 Cambio de tercero | Navegador real y conteo de solicitudes OIDC: no hay nueva autenticación. |
| 14 Recarga | Navegador real restaura preferencia del mismo sujeto y rechaza/restaura de forma segura tras manipulación o revocación. |
| 15 Logout | Navegador real borra contexto y notifica a otra pestaña; unitarias descartan respuestas anteriores. |
| 16 Expiración | Cierre de sesiones del realm efímero y recarga requieren login; transporte invalida ante 401. |
| 17 Permisos cambiantes | Política MongoDB cambiada en sesión real y evento de foco retiran el contexto sin grants. |
| 18 Solicitud pendiente | Unitarias: captura de scope, abort y generación; B tardía no sobrescribe C. |
| 19 Recurso anterior | Contrato de autorización existente con dobles. Integración real pendiente de Fleet/Invoices, tarea 13.1 sin completar. |
| 20 Ruta directa | Guard oculta contenido antes de contexto y durante refresh. |
| 21 Pestañas diferentes | Navegador real: contextos distintos independientes y copia de preferencia de pestaña duplicada revalidada. |
| 22 Manipulación | DTO estricto; subject/permisos extra rechazados; preferencia manipulada se revalida. |

## Límites pendientes

La entrega del lector y selector permite comprobar integraciones 6.1–6.2 de implement-authorization, pero no modifica sus casillas. No se completa aceptación sobre vehículos/facturas reales ni serialización de una escritura con revocación: faltan propietarios y escritor versionado (tareas 13.1–13.2). Audit todavía no tiene entrega/retención integral; Organizations conserva captura mínima pendiente de entrega. Los datos funcionales requieren provisión autorizada, sin autoasignación en login.

No se han sincronizado specs principales ni archivado cambios. Las restricciones históricas de foundations siguen reconciliándose mediante los flujos documentales ya definidos, sin revertir autenticación funcional.
