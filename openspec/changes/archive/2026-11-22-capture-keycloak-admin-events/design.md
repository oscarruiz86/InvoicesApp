# Diseño (Design)

## Contexto (Context)

Consulta [proposal.md](proposal.md). Keycloak 26.8.2 expone eventos administrativos con un ID de evento del proveedor y una marca de tiempo en milisegundos. La API REST de administración admite páginas ordenadas y acotadas sobre intervalos de tiempo inclusivos. El realm local se importa desde `keycloak/invoices-realm.json`; producción no utiliza ese perfil local de Compose.

## Objetivos y fuera de alcance (Goals / Non-Goals)

**Objetivos:** acceso de lectura con privilegios mínimos; hechos de Audit normalizados y mínimos; consulta periódica acotada y segura ante reinicios; captura de eventos y ejecución del recolector solo en el entorno local.

**Fuera de alcance:** consumir eventos de inicio de sesión o de usuarios, conservar las representaciones sin procesar de Keycloak, exponer consultas de Audit, cambiar la configuración del realm de producción o modificar la política de retención de Audit.

## Decisiones (Decisions)

- Crear una cuenta de servicio dedicada para el recolector local y asignarle únicamente `realm-management:view-events`. Aprovisionar sus credenciales desde un archivo secreto local proporcionado externamente; no guardar las credenciales en el JSON del realm ni en el repositorio.
- Establecer `adminEventsEnabled=true` y `adminEventsDetailsEnabled=false` en el realm local importado. No usar la API REST de administración para reconfigurar un realm desplegado.
- Mapear el `id` del proveedor a un ID de evento de Audit estable y con espacio de nombres, y el `time` del proveedor a `occurredAt`. Permitir únicamente la operación y el tipo de recurso aprobados, junto con un identificador terminal de recurso validado. Usar el ID verificado del usuario administrador o el ID del cliente de la cuenta de servicio cuando Keycloak informe que el actor es un cliente. Nunca persistir `representation`, valores libres de `details`, direcciones IP, tokens de acceso ni otros datos del proveedor.
- Consultar un `dateTo` fijo en cada ciclo, recorrer páginas en orden ascendente con un tamaño acotado y actualizar el cursor de Mongo únicamente después de escribir todas las páginas. Iniciar el ciclo siguiente en el último límite superior completado menos un pequeño solapamiento; los IDs de proveedor idempotentes absorben los reintentos del solapamiento y protegen frente al filtro de fecha inclusivo.
- Mantener el proceso de consulta independiente de los controladores de solicitudes y exponer su servicio de Compose solo mediante un perfil local opcional. Inyectar el puerto de escritura de Audit para que esta propuesta pueda desarrollarse por separado del adaptador MongoDB de Audit.

## Riesgos y compensaciones (Risks / Trade-offs)

- [La retención de Keycloak puede hacer expirar eventos antes de recuperar una interrupción prolongada] → Consultar continuamente, informar los fallos y documentar que el flujo de eventos ascendente solo es una fuente recuperable mientras Keycloak conserve el evento.
- [Una respuesta del proveedor puede superar el límite de página o cambiar durante la consulta] → Fijar la marca de tiempo superior de cada consulta, recorrer las páginas en orden y usar un solapamiento acotado en la consulta siguiente.
- [Los datos del evento pueden contener información sensible] → Desactivar la captura de detalles en el realm local y descartar explícitamente la representación, los detalles y los identificadores de red del proveedor en el mapper.

## Plan de migración (Migration Plan)

Crear el cliente de cuenta de servicio de desarrollo y la asignación `view-events` mediante un comando local de configuración idempotente que use archivos secretos. Iniciar el recolector solo con el perfil de Compose `keycloak-admin-audit`, cuando el escritor de Audit esté disponible. Para revertir, detener ese perfil y eliminar el cliente local; al volver a iniciarse, se consultarán de nuevo los intervalos pendientes. No se incluye ninguna modificación del realm de producción ni una carga histórica de eventos.
