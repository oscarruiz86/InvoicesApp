# Initial Invoices App — revisión de cierre

Estado al 22 de noviembre de 2026: propuesta reconciliada y tareas completadas. La solicitud actual del usuario autoriza explícitamente cerrar las tareas pendientes y crear el commit en `openspec/initial-invoices-app`. Las decisiones P1–P7 se verificaron contra especificaciones, documentación y capacidades implementadas; no se añadieron supuestos para cerrar huecos.

## Arquitectura revisada

- Frontend y backend son aplicaciones independientes con capas Domain, Application, Infrastructure y Presentation, composición en `frontend/src/app` y `backend/src/bootstrap`, y contratos REST entre aplicaciones. La propiedad y colaboración de los seis contextos se documenta en `docs/architecture.md`.
- Domain/Application consumen contratos; React, Material UI, Zustand, Next.js, Mongoose, `keycloak-js` y `jose` permanecen en sus áreas externas. Las verificaciones arquitectónicas comprueban dependencias prohibidas, aliases y ciclos.
- Los contratos REST/OpenAPI, la autoridad del backend y pruebas de dominio, aplicación, infraestructura, HTTP y presentación se contrastan con los módulos existentes y sus especificaciones.

## Resolución de decisiones P1–P7

| ID | Decisión vigente y evidencia |
| --- | --- |
| P1 | Los cuatro roles son `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`; no hay herencia implícita. Grants y asociaciones se comprueban en backend, con ámbito propio y pertenencia activa. Evidencia: `docs/authorization.md`, `docs/assignment-management.md` y `docs/vehicle-management.md`. |
| P2 | `invoice.manual-edit-window-seconds`: entero global de 1 a 31.536.000 segundos, inicial 43.200; límite exclusivo desde `createdAt`, reloj servidor. El cambio afecta facturas existentes. Sin política válida, la edición falla cerrada con 503. Evidencia: `openspec/specs/configuration/spec.md`, `docs/verification.md` (parameter management). |
| P3 | QR v1 exige `NumFac`, `FecFac`, `HorFac`, `NitFac`, `DocAdq`, `ValFac`, `ValIva`, `ValOtroIm`, `ValTolFac`; CUFE y URL HTTPS son opcionales. Parsing local y autoritativo, sin navegación ni envío externo; QR es inmutable y nunca certifica autenticidad fiscal. Evidencia: `docs/invoice-qr-scanning.md` y `docs/invoice-management.md`. |
| P4 | La asignación propia y activa se confirma al escribir; Fleet es dueño de `vehicle_assignments`. Historial y referencias de factura no se reescriben al cerrar o reasignar. Desactivar un vehículo con asignación activa se rechaza; las mutaciones verifican revisiones dentro de transacción. Evidencia: `docs/assignment-management.md`, `docs/vehicle-management.md` y `docs/invoice-management.md`. |
| P5 | Resuelto: Audit persiste eventos normalizados append-only e idempotentes con retención de dos años desde `occurredAt`; TTL no elimina antes del vencimiento. La captura diferida es durable, se reintenta y se deduplica por `eventId`. No hay endpoint de historial y `audit:read` sigue denegado hasta aprobar una política de consulta. Evidencia: `docs/audit.md`, `openspec/changes/archive/2026-11-22-implement-audit-delivery/design.md`, `openspec/changes/archive/2026-11-22-implement-audit-delivery/specs/audit/spec.md`, `openspec/changes/archive/2026-11-22-capture-keycloak-admin-events/design.md`. |
| P6 | Keycloak realm `invoices`, cliente público `invoices-web`, Authorization Code + PKCE S256; audiencia `invoices-api` solo para Access Token; issuer exacto y JWT verificado. Roles sin asignación por defecto; sin passwords en la aplicación. Evidencia: `docs/authentication.md`. |
| P7 | OpenAPI 3.1 publica DTO cerrados, Bearer, errores y contexto. Las rutas vuelven a validar autoridad, propiedad y versiones; escrituras auditables se confirman en transacción y responden conflictos/indisponibilidad sin éxito parcial. Evidencia: `backend/openapi/openapi.json`, `docs/authorization.md`, `docs/invoice-management.md`, `docs/assignment-management.md`. |

## Verificación ejecutada

- `npm --prefix backend run openapi:lint`: aprobado.
- Backend: ESLint 0 errores (9 advertencias); TypeScript correcto; `npm --prefix backend run test -- --maxWorkers=1`: 50 archivos, 467/467 pruebas; arquitectura aprobada; build Next.js aprobado con rutas API de los módulos entregados.
- Frontend: ESLint 0 errores (13 advertencias); TypeScript correcto; `npm --prefix frontend run test -- --maxWorkers=1 --reporter=verbose`: 36 archivos, 221/221 pruebas; arquitectura aprobada; build Vite aprobado. El bundle principal de 1.035,25 kB supera el aviso predeterminado de 500 kB.
- Las primeras ejecuciones paralelas provocaron la salida inesperada de un worker backend; al ejecutar backend en un worker pasaron las 467 pruebas. La suite frontend completa terminó en modo verbose y un worker en 258,93 s. Estos resultados son la evidencia de integración registrada antes del merge de `development`; las capacidades de auditoría añadidas después tienen su propia verificación en los cambios OpenSpec indicados abajo.
- `npm --prefix backend run test:integration:prepared`: 17 archivos, 74/74 pruebas aprobadas con MongoDB y Keycloak desechables.
- `npm --prefix backend run test:http:prepared`: aceptados HTTP real, OpenAPI, Swagger local, configuración inválida, autorización y vehículos. El primer intento reveló una aserción vieja que trataba `/api/invoices` como ruta inexistente; se actualizó el harness para exigir Bearer y aceptar 401/503 según configuración, y volvió a pasar.
- `npm --prefix frontend run test:e2e:prepared`: 38/38 pruebas Playwright aprobadas con proxy Vite/Next y servicios aislados; incluye autenticación, empresas, flota, facturas, QR, parámetros, roles, invitaciones, responsive y aislamiento de contexto.
- Audit delivery: tareas verificadas y cerradas en `openspec/changes/archive/2026-11-22-implement-audit-delivery/tasks.md`, incluidos contrato, retención, idempotencia, recuperación y política de privacidad.
- Captura de eventos administrativos Keycloak: tareas verificadas y cerradas en `openspec/changes/archive/2026-11-22-capture-keycloak-admin-events/tasks.md`, con mapeo permitido, cursor reanudable y ejecución local opt-in.

## Cierre de la propuesta

- P1–P7 quedaron documentadas en `openspec/changes/initial-invoices-app/design.md`; la aprobación explícita para implementar consta en la solicitud del usuario del 22 de noviembre de 2026.
- Las cuatro tareas que estaban pendientes (2.4, 2.5, 5.2 y 5.3) se cerraron con la decisión de P5, la entrega Audit y el alcance aprobado sin consulta de historial. La configuración mantiene sus endpoints documentados y probados.
- Progreso registrado: 36/36 tareas. `openspec validate initial-invoices-app --strict --no-interactive` pasó antes del archivo.
- Las siete deltas se sincronizaron con `openspec/specs/`; `openspec validate --specs` reportó 22 aprobadas y 0 fallidas (con avisos preexistentes en requisitos largos de otras capacidades).
- La propuesta quedó archivada en `openspec/changes/archive/2026-11-22-initial-invoices-app`.
