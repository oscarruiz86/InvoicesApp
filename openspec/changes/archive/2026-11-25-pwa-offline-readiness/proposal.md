# Proposal

## Why

Hoy la credencial offline, las asignaciones y el lector QR se preparan desde la página Facturas; por eso el conductor debe visitar esa pantalla con conexión antes de salir de cobertura. Además, el service worker existente solo conserva una parte del shell y no hay manifiesto instalable, de modo que cerrar o reabrir la app en un teléfono puede impedir volver a la captura local.

## What Changes

- Incorporar los requisitos para instalar Invoice App como PWA en dispositivos móviles, abrirla desde el inicio del dispositivo y actualizar su shell de forma controlada.
- Preparar automáticamente la captura offline después del inicio de sesión y de resolver el contexto activo del conductor, sin bloquear la navegación ni requerir abrir Facturas.
- Precargar y verificar en segundo plano la credencial firmada vigente, asignaciones autorizadas, recursos estáticos necesarios y lector QR; informar progreso, disponibilidad y errores recuperables.
- Hacer que el shell y la ruta de captura puedan abrirse tras cerrar o recargar la PWA sin conexión, usando únicamente la credencial offline válida y datos locales aislados por sujeto y tercero.
- Solicitar almacenamiento persistente cuando el navegador lo permita, detectar fallos/cuota insuficiente y comunicar que los registros locales no tienen respaldo hasta sincronizarse.
- Reanudar el intento de sincronización cuando la app vuelva a abrirse, recupere conectividad o reciba foco. Background Sync será una mejora progresiva cuando esté disponible y sea compatible con la autorización normal; no se persistirán tokens para forzar envíos con la app cerrada.
- Mantener una vigencia offline máxima de 72 horas, revalidación online, controles por rol/contexto y limpieza de datos al cerrar sesión/cambiar de usuario. El backend configurará `OFFLINE_CREDENTIAL_TTL_HOURS=72` y el frontend `VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS=72`; el backend seguirá siendo la autoridad y el navegador rechazará valores mayores aunque su `.env` local fuese alterado.

## Capabilities

### New Capabilities
- `pwa-runtime`: instalación móvil, shell offline, ciclo de vida/actualización del service worker y persistencia local administrada.

### Modified Capabilities
- `invoice-sync`: preparar captura automáticamente tras login y contexto activo; conservar acceso offline al reabrir la PWA y retomar sincronización al volver a estar activa.

## Impact

- Frontend: `frontend/index.html`, `frontend/public/`, `frontend/src/app/main.tsx`, composición global de `App`, coordinación de autenticación/contexto y servicios de cola/sincronización de facturas.
- Pruebas: escenarios de shell instalable, inicio offline después de login sin visitar Facturas, cierre/reapertura, cambio de contexto/sujeto, credencial de 72 horas expirada, almacenamiento no persistente y sincronización con/fuera de Background Sync.
- Despliegue móvil: requiere servir la aplicación bajo HTTPS en entornos distintos de localhost. No cambia los endpoints de facturas ni autoriza la credencial offline a llamar a la API.
