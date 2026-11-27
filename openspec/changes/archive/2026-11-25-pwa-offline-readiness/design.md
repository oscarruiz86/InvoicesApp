# Design

## Context

La aplicación ya registra un service worker mínimo, guarda la cola y la credencial offline en IndexedDB, y prepara esos datos desde `InvoicesPage`. La autenticación y el contexto activo se resuelven globalmente antes de montar las páginas privadas. La credencial offline solo sirve para validar captura local; el envío al backend requiere la sesión normal.

## Goals / Non-Goals

**Goals:**

- Convertir el shell web en una PWA instalable y recuperable sin red.
- Mover la preparación offline a un coordinador global que observe autenticación, perfil, permisos y contexto activo.
- Mantener aislamiento por sujeto/tercero, expiración, cancelación y limpieza existentes.
- Reanudar sincronización al iniciar, recuperar conexión y recibir foco, con Background Sync como mejora opcional.
- Dar visibilidad operativa sin revelar tokens, QR completo ni identificadores internos.
- Permitir continuidad operativa hasta 72 horas sin exigir que la PWA se abra en primer plano durante ese intervalo.

**Non-Goals:**

- No persistir Access Token, Refresh Token ni crear una sesión API offline.
- No garantizar sincronización con la app cerrada en navegadores que no soporten Background Sync.
- No cambiar las reglas de resolución de conflictos ni la emisión server-side de la credencial.
- No convertir datos de negocio del backend en respuestas cacheadas por el service worker.

## Decisions

### Coordinador global de preparación

Crear un servicio de aplicación que reciba los puertos ya existentes de autenticación, autorización, contexto, API de facturas, cola y precarga QR. Se suscribirá a cambios de sujeto/contexto y ejecutará una máquina de estados `idle | preparing | ready | degraded | expired`. La generación del contexto y un `AbortController` evitarán que respuestas tardías guarden credenciales del contexto anterior.

La preparación se inicia después de que el perfil y el contexto estén listos, y no bloquea el render de `App`. `InvoicesPage` consumirá el estado y dejará de ser responsable de emitir la credencial o precargar el lector, salvo acciones explícitas de reintento.

### Política de vigencia de la credencial

El backend será la fuente de verdad para la vigencia y emitirá credenciales offline con un TTL objetivo de 72 horas mediante `OFFLINE_CREDENTIAL_TTL_HOURS=72`. El frontend tendrá `VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS=72` para mantener alineada la validación local, pero esa variable solo sirve como límite defensivo y nunca puede ampliar la autorización: el código conservará un máximo absoluto de 72 horas. El verificador del navegador rechazará valores mayores o inconsistentes y bloqueará nuevas capturas al expirar. No se guardarán tokens de sesión ni se intentará renovar la credencial desde el service worker.

### PWA y cache del shell

Añadir `manifest.webmanifest` e iconos, enlazarlos desde `index.html` y versionar el cache del service worker. El worker usará cache-first para el shell/activos generados y network-first con fallback solo para navegaciones; excluirá `/api/` y no almacenará respuestas protegidas. Las actualizaciones se instalarán en un cache nuevo y se activarán con una señal explícita de actualización.

### Persistencia y reanudación

Solicitar `navigator.storage.persist()` una vez por sesión autenticada, registrar el resultado en el estado de preparación y capturar errores de cuota. Al guardar una captura se intentará registrar `sync` con una etiqueta estable si el navegador lo soporta. El evento de service worker no enviará datos por sí mismo sin una sesión válida; la aplicación sincronizará al volver a estar activa, recibir foco o recuperar conexión.

### Contrato de sincronización

Mantener la cola IndexedDB y el sincronizador HTTP existentes. La reanudación global llamará al mismo caso de uso idempotente, con límites de concurrencia y backoff ya definidos, y notificará cambios al estado/pestaña de pendientes. No se duplicará una segunda implementación dentro del service worker.

### Compatibilidad móvil

La instalación se validará bajo HTTPS en Chrome/Edge Android y Safari iOS mediante “Añadir a pantalla de inicio”. Las capacidades opcionales se detectarán con feature detection. En iOS y navegadores sin Background Sync se conservará la ruta de reapertura y sincronización al abrir/foco, pero no se prometerá ejecución en segundo plano.

## Risks / Trade-offs

- [El navegador puede desalojar IndexedDB o denegar almacenamiento persistente] → mostrar estado degradado, conservar la cola mientras sea posible y pedir reconexión antes de nuevas capturas críticas.
- [La credencial expira mientras la PWA está cerrada] → bloquear nuevas capturas al reabrir, conservar pendientes y solicitar login online; nunca extender la vigencia local. La ventana de continuidad es de hasta 72 horas.
- [La configuración del servidor y el frontend divergen] → validar el máximo de 72 horas en backend y frontend, tratar al backend como autoridad y rechazar credenciales fuera de política.
- [Background Sync tiene soporte limitado y límites de ejecución] → mantener siempre los disparadores de apertura, foco y evento `online` como ruta principal.
- [Un service worker antiguo puede servir un shell desactualizado] → versionar caches, usar `skipWaiting` solo tras instalación completa y ofrecer recarga controlada.
- [La preparación aumenta tráfico después del login] → deduplicar por sujeto/tercero/generación y actualizar solo asignaciones activas.

## Migration Plan

1. Publicar manifiesto, iconos y nueva estrategia de cache manteniendo la ruta actual de entrada.
2. Extraer la emisión/preparación offline de `InvoicesPage` al coordinador global y conservar una lectura de compatibilidad durante la transición.
3. Activar reanudación global y almacenamiento persistente con telemetría de estados, sin alterar endpoints existentes.
4. Probar instalación, recarga/cierre sin conexión, cambio de contexto, expiración, limpieza de sesión y sincronización en navegadores con y sin Background Sync.
5. Si hay problemas, desactivar la preparación automática mediante configuración y volver a solicitarla desde Facturas; el cache versionado permite invalidar el shell anterior.

## Open Questions

No quedan decisiones funcionales pendientes para iniciar la implementación. La matriz exacta de iconos y la política visual del aviso de actualización pueden resolverse dentro de la tarea de UI sin cambiar el contrato.
