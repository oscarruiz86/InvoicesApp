# Tasks

## 1. Shell PWA e instalación

- [x] 1.1 Añadir `manifest.webmanifest`, iconos, metadatos de instalación y colores de Invoice App; verificar con una auditoría de manifiesto que nombre, iconos, `start_url`, `scope` y `display` sean válidos.
- [x] 1.2 Versionar el service worker, precargar el shell generado y servir navegación desde cache con fallback offline sin interceptar `/api/`; verificar con Playwright que una recarga sin red abre el shell y que una solicitud API no se almacena.
- [x] 1.3 Implementar actualización controlada del service worker y aviso de nueva versión; verificar que una versión nueva no borra el cache activo antes de completar la instalación y que la aplicación puede actualizarse tras confirmación.
- [x] 1.4 Documentar instalación en Android/Chrome y iOS/Safari, requisito HTTPS y limitaciones de Background Sync en la guía de operación; verificar que los pasos funcionen en un entorno de preview HTTPS.

## 2. Preparación global después del login

- [x] 2.1 Extraer la emisión/verificación de credencial, snapshot de asignaciones y precarga QR de `InvoicesPage` a un coordinador de aplicación que observe autenticación, permisos y contexto; verificar con pruebas unitarias que solo se ejecuta para DRIVER con contexto válido.
- [x] 2.2 Hacer idempotente y cancelable la preparación por sujeto, tercero y generación; verificar que un cambio de contexto no conserva credenciales ni asignaciones de la generación anterior.
- [x] 2.3 Integrar el estado de preparación en el shell (`preparing`, `ready`, `degraded`, `expired`) sin bloquear el render de `App`; verificar que el usuario pueda navegar mientras la preparación continúa y que el aviso no aparezca para roles no DRIVER.
- [x] 2.4 Añadir reintento explícito y manejo seguro de errores de emisión, firma, asignaciones o lector QR; verificar que no se muestran tokens, QR completo ni identificadores internos.
- [x] 2.5 Configurar `OFFLINE_CREDENTIAL_TTL_HOURS=72` en backend y `VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS=72` en frontend, actualizar los esquemas y el verificador para rechazar duraciones mayores o inconsistentes y verificar emisión, reapertura antes de expirar y bloqueo posterior a la expiración; el backend permanece como autoridad.

## 3. Persistencia y reapertura móvil

- [x] 3.1 Solicitar `navigator.storage.persist()` cuando exista y registrar cuota/estado de persistencia en el estado offline; verificar los caminos concedido, denegado y excepción sin perder la cola existente.
- [x] 3.2 Asegurar que la ruta de entrada y la captura offline se reconstruyan desde IndexedDB tras cerrar/reabrir o recargar sin red, sin visitar Facturas; verificar con Playwright el flujo login online → preparación → cierre → reapertura offline → captura manual y QR.
- [x] 3.3 Mantener aislamiento y limpieza por sujeto/tercero al cambiar contexto, cerrar sesión o expirar la sesión; verificar que no se muestran ni sincronizan registros de la cuenta anterior.
- [x] 3.4 Añadir una vista compacta de estado local que informe expiración, asignaciones disponibles, almacenamiento degradado y cantidad de pendientes; verificar accesibilidad y lectura en viewport móvil.

## 4. Reanudación y sincronización

- [x] 4.1 Conectar la cola existente a eventos de inicio de la PWA, `online` y `visibilitychange`/foco; verificar que una cola pendiente intenta sincronizar sin navegar a Facturas y conserva estados terminales fuera de pendientes.
- [x] 4.2 Registrar Background Sync cuando `registration.sync` esté disponible, con una etiqueta estable y sin tokens persistidos; verificar el registro en Chromium y el fallback explícito en navegadores sin soporte.
- [x] 4.3 Evitar que el service worker envíe API sin sesión normal y mantener idempotencia/backoff del sincronizador; verificar que el worker no lee credenciales de autenticación y que un reintento no duplica facturas.
- [x] 4.4 Documentar límites de ejecución en segundo plano y comportamiento esperado en iOS/Firefox; verificar que la UI no prometa sincronización automática con la app cerrada cuando la capacidad no esté disponible.

## 5. Integración y aceptación

- [x] 5.1 Ampliar pruebas unitarias de preparación, persistencia, expiración de 72 horas, cambio de contexto y feature detection; verificar con `npm test -- --runInBand` en frontend y los tests específicos del sincronizador.
- [x] 5.2 Añadir pruebas E2E de instalación/shell, cierre-reapertura offline, captura sin visitar Facturas, pérdida de almacenamiento y recuperación online; verificar con `npm run test:e2e:offline-shell` y el escenario offline de invoice sync.
- [x] 5.3 Ejecutar lint, typecheck, arquitectura y build de producción; verificar con `npm run check`, `npm run test:architecture` y `npm run build` sin errores.
- [x] 5.4 Actualizar documentación de despliegue con HTTPS, invalidación de cache, iconos, TTL offline de 72 horas, pruebas móviles, recuperación ante credencial vencida y procedimiento de rollback; verificar que cada comando documentado sea reproducible en preview.

## Workflow follow-up

- Revisar los artefactos y aplicar la propuesta con `$openspec-apply-change` cuando se apruebe.
- Tras completar y validar la implementación, archivar el cambio con `$openspec-archive-change`.
