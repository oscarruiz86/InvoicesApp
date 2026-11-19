# Tasks

## 1. Confirmación y progreso

- [x] 1.1 Sustituir la confirmación inline por un modal accesible que resuma el reemplazo completo y su versión; verificar que cancelar conserva el borrador y no llama al API con pruebas unitarias.
- [x] 1.2 Mostrar CircularProgress y un estado accesible durante el envío, bloqueando cierre y envíos duplicados; verificar con una respuesta diferida que solo se emite una solicitud.

## 2. Respuesta y continuidad de la selección

- [x] 2.1 Al completar con éxito, actualizar desde la respuesta del API y mostrar la versión confirmada; verificar que el texto coincide con la versión devuelta por el mock/servicio.
- [x] 2.2 Al recibir 409 o 503 POLICY_AUDIT_CAPACITY, mostrar el error seguro, preservar el borrador y permitir recargar cuando corresponda; verificar cada estado antes y después de recargar.
- [x] 2.3 Conservar la pestaña de rol elegida al completar con éxito, error o recarga; verificar selección con pruebas unitarias en cada resultado.

## 3. Verificación integrada

- [x] 3.1 Añadir recorridos de navegador para abrir/cancelar/confirmar el modal, mostrar progreso y resultado, mantener la pestaña, y verificar teclado y anchos de 360 px y 1280 px.
- [x] 3.2 Ejecutar lint, typecheck, pruebas unitarias, arquitectura frontend y E2E de Roles; registrar resultados y advertencias existentes en docs/verification.md.

## Workflow follow-up

- Crear la rama openspec/improve-role-management-save-feedback desde development para implementar esta propuesta en una rama exclusiva.
- Abrir un pull request hacia development después de revisión aprobada.
- Archivar el cambio después de completar las tareas, sincronizar la especificación y satisfacer la revisión del proyecto.
