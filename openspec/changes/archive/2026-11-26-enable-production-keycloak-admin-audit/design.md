# Design

## Context

Véase [proposal.md](proposal.md) para la motivación y [specs/keycloak-admin-audit/spec.md](specs/keycloak-admin-audit/spec.md) para el contrato. El colector y el worker de eventos administrativos ya existen para desarrollo. El repositorio contiene `compose.yaml` local y una alerta de Prometheus, pero no contiene una configuración de despliegue de producción de Keycloak/Invoicing App ni infraestructura productiva donde activar el proceso.

## Goals / Non-Goals

**Goals:** reutilizar el colector existente en un runtime productivo explícitamente configurado; obtener eventos administrativos verificables sin representaciones; validar credenciales y permisos de lectura mínima; dejar documentación para conectar la futura plataforma productiva.

**Non-Goals:** desplegar Keycloak o Invoices App, provisionar secretos reales, importar eventos históricos, capturar eventos de usuario, cambiar el realm local o habilitar representaciones para hacer más fácil el diagnóstico.

## Decisions

### Capture del lado de Keycloak sin representaciones

En un runtime Keycloak productivo explícitamente configurado, activar el almacenamiento de eventos administrativos y mantener desactivados los detalles/representaciones. La documentación debe usar las opciones correspondientes a la versión fijada de Keycloak; la guía oficial advierte que la representación incluye documentos JSON de las solicitudes administrativas y puede acumular información innecesaria.

**Alternativa considerada:** capturar solo logs de servidor. Se descarta porque no garantiza identidad estable del evento, cursor de recuperación ni la forma normalizada que ya consume Audit.

### Reutilizar el colector y cursor actuales

Mantener la consulta por ventanas acotadas, paginación ordenada, solapamiento e IDs derivados del evento del proveedor. Mantener el cursor sin avanzar hasta que cada evento de la ventana haya sido aceptado por Audit. No crear una segunda ruta de captura.

**Alternativa considerada:** enviar cada cambio a la API de Invoices App desde Keycloak. Se descarta porque añadiría un plugin y disponibilidad síncrona en el camino administrativo; el recolector actual permite reintentos desacoplados.

### Configuración productiva separada de Compose local

Agregar validación y documentación de un grupo de configuración productiva independiente; el secreto debe llegar como archivo fuera del repositorio. El grupo usa `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_ENABLED`, `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_BASE_URL`, `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_REALM`, `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_ID`, `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_CLIENT_SECRET_FILE` y `KEYCLOAK_ADMIN_AUDIT_PRODUCTION_WRITER_MODULE`; Mongo usa `MONGODB_URI_FILE`. La ausencia completa del grupo deja el worker deshabilitado en `NODE_ENV=production`; un grupo parcial, una URL que no use HTTPS, secretos inline o variables del perfil local en producción impiden el inicio con un código genérico. El perfil Compose local conserva sus nombres actuales y no activa la configuración productiva.

No añadir credenciales ni valores reales en `.env.example`, Compose o archivos versionados. Dado que no existe runtime productivo configurado, entregar el contrato y pruebas de configuración sin desplegarlo.

### Cuenta recolectora de solo lectura

Asignar a la cuenta de servicio únicamente el permiso de lectura de eventos administrativos (`realm-management:view-events` en la versión objetivo), sin permisos de escritura del realm. Mantener el cliente de la WebApp separado de la identidad del recolector.

**Alternativa considerada:** reutilizar la cuenta de administración existente. Se descarta porque ampliaría el impacto de una credencial comprometida y no cumpliría mínimo privilegio.

### Normalización estricta

Reutilizar los mappers actuales para guardar identidad del evento, instante, operación, categoría del recurso y actor verificado; excluir `representation`, detalles libres, IP, tokens y credenciales. No expandir el mapper por el hecho de activar producción.

## Risks / Trade-offs

- [Keycloak puede expirar eventos antes de una recuperación extensa] → Ejecutar la consulta de forma continua, alertar sobre retraso y documentar el límite de retención del proveedor.
- [No existe destino productivo en este repositorio] → La propuesta deja el worker desactivado sin configuración y no afirma captura efectiva en producción hasta integrarlo al runtime futuro.
- [Cambios de configuración pueden variar entre versiones] → Verificar opciones y permisos contra la versión Keycloak fijada (26.8.2) con prueba de integración aislada.
- [La credencial del lector puede filtrarse] → Inyectarla mediante archivo secreto, probar que no aparezca en logs/configuración serializada y documentar rotación externa.

## Migration Plan

No hay datos históricos que migrar. Mantener intacta la captura de desarrollo. Preparar el contrato productivo y su validación; activar el worker solo cuando un despliegue de Keycloak productivo proporcione configuración, cuenta de lectura y secreto. Para rollback, apagar el worker productivo conservando el cursor; no borrar eventos capturados ni credenciales externas.

## Open Questions

Ninguna para preparar el código y la configuración. El operador del futuro runtime debe proporcionar el endpoint/realm, secreto de la cuenta recolectora y política de retención del feed antes de activar producción.
