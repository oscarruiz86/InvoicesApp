# Tasks

## 1. Configuración productiva segura

- [x] 1.1 Definir el grupo de configuración productiva separado del perfil Compose local; verificar con pruebas que una configuración ausente deshabilita el worker y una configuración parcial impide su inicio sin imprimir secretos.
- [x] 1.2 Documentar configuración del realm productivo con eventos administrativos habilitados y representaciones deshabilitadas, usando opciones compatibles con Keycloak 26.8.2; verificar el realm de prueba por Admin REST.
- [x] 1.3 Documentar aprovisionamiento externo de cuenta lectora con `realm-management:view-events` y secreto por archivo; verificar en prueba que la cuenta lee eventos y no puede modificar realm, cliente ni roles.

## 2. Reutilización del colector

- [x] 2.1 Conectar el worker existente al grupo productivo validado sin alterar Compose local; verificar el arranque separado de ambos perfiles y la ausencia de credenciales en `process.env` serializado/logs.
- [x] 2.2 Verificar eventos administrativos con Keycloak 26.8.2 aislado: actor, acción, recurso, ID estable, cursor no adelantado y recuperación tras reinicio; confirmar que no se envían representaciones, detalles, IP ni datos libres.
- [x] 2.3 Añadir verificación operativa de retraso, fallos de consulta y rotación externa del secreto; comprobar que logs solo muestran conteos/códigos neutros y que el procedimiento no activa una instancia real.

## 3. Aceptación

- [x] 3.1 Ejecutar checks backend, pruebas unitarias/integración aislada y `openspec validate enable-production-keycloak-admin-audit --strict`; registrar evidencia y confirmar que no se desplegó Keycloak ni se hizo backfill histórico.

## Workflow follow-up

- Integrar el worker a la plataforma productiva únicamente cuando exista un runtime de Keycloak y se hayan entregado los secretos fuera del repositorio.
- Archivar el cambio después de aprobar los checks y documentar los límites hasta que se active el runtime.
