# Tasks

Esta lista describe trabajo futuro; ninguna casilla acredita trabajo implementado. La entrega actual solo crea planificación. No ejecutar tareas de código, scaffolding, instalación o integración hasta recibir aprobación explícita posterior a la revisión. Los grupos se ejecutan en orden de dependencia; todos los módulos funcionales requieren la definición y validación de ambas arquitecturas de los grupos 1 y 3.

Cada tarea futura debe respetar SOLID, DDD y Clean Architecture, citar los requisitos aplicables y verificar los límites de capas. No se cierra una tarea solo por tener la estructura de carpetas.

## 1. Definición y revisión documental de arquitectura

- [x] 1.1 Revisar los seis bounded contexts, propiedad de datos, mapa de colaboración y elementos DDD candidatos; verificar un registro de revisión sin acceso directo a modelos ajenos ni dependencias circulares (`project-foundation`).
- [x] 1.2 Validar documentalmente la arquitectura frontend: módulos, cuatro capas, puertos HTTP, composición, Material UI y ubicación de Zustand; verificar un recorrido de interacción que mantenga Domain/Application sin React y la decisión autoritativa en el backend (`project-foundation`, diseño 4–5).
- [x] 1.3 Validar documentalmente la arquitectura backend: REST, controladores delgados, repositorios, composición, adaptadores Keycloak y modelos Mongoose; verificar un recorrido de solicitud con dependencias hacia dentro y sin persistencia en controladores (`project-foundation`, diseño 4 y 6–11).
- [x] 1.4 Revisar estrategia de pruebas por capa y criterios SOLID; verificar una matriz de requisitos/escenarios/evidencias que cubra contratos sustituibles, autorización, contexto, historial y fallos parciales (`project-foundation`, diseño 12).

## 2. Decisiones funcionales y aprobación previa

Los puntos P1–P7 remiten a la tabla de decisiones de `design.md`. Su resolución puede requerir ajustar escenarios y tareas; no se implementa una política basada en una suposición no aprobada.

- [x] 2.1 Acordar P1 (roles, permisos, excepciones y asociaciones) y P6 (realm, cliente, claims y sesión); verificar una matriz de acceso y un contrato de identidad aprobados y reflejados en diseño/especificaciones (`identity-access`, `organizations`).
- [x] 2.2 Acordar P2 (ventana, borde, ámbito y efecto temporal) y P3 (restricciones y formato QR); verificar ejemplos concretos de aceptación y rechazo en los escenarios revisados (`configuration`, `invoice-management`).
- [x] 2.3 Acordar P4 (referencia temporal de asignación, cardinalidades y desactivación); verificar escenarios revisados de transición, incompatibilidad e historial (`fleet-management`, `invoice-management`).
- [ ] 2.4 Acordar P5 (confirmación/auditoría, datos, retención y acceso) y P7 (DTO, errores, concurrencia y persistencia); verificar decisiones documentadas y escenarios de fallos parciales consistentes (`audit`, `project-foundation` y capacidades afectadas).
- [ ] 2.5 Reconciliar propuesta, diseño, siete deltas y tareas con los acuerdos y obtener aprobación explícita para implementar; verificar constancia de aprobación y ejecutar `openspec validate initial-invoices-app --strict --no-interactive`. Un resultado válido por sí solo no satisface la aprobación.

## 3. Bases técnicas y validación de ambas aplicaciones — solo tras 2.5

- [x] 3.1 Preparar las aplicaciones independientes con los stacks aprobados y su estructura modular; verificar compilación independiente y ausencia de imports internos entre frontend y backend (`project-foundation`).
- [x] 3.2 Preparar composición y comprobaciones automatizadas de capas del frontend sin módulos funcionales; verificar que detectan imports prohibidos y ciclos y que las capas internas no requieren React, Material UI ni Zustand (`project-foundation`).
- [x] 3.3 Preparar composición y comprobaciones automatizadas de capas del backend sin módulos funcionales; verificar que detectan imports prohibidos y ciclos y que Domain/Application no requieren Next.js, Mongoose ni Keycloak (`project-foundation`).
- [x] 3.4 Documentar y validar los contratos públicos iniciales REST/OpenAPI y el mapeo de errores acordado, sin modelos de persistencia; verificar su validez y la correspondencia con los escenarios aprobados (`project-foundation`, P7).
- [x] 3.5 Registrar el resultado de validación de arquitectura frontend y backend antes de abrir módulos funcionales; verificar compilaciones, límites y contratos de 3.1–3.4 y trazabilidad a los criterios SOLID revisados en 1.4 (`project-foundation`).

## 4. Identity & Access y Organizations — requiere 3.5

- [x] 4.1 Desarrollar el puerto de identidad y el adaptador Keycloak conforme a P6; verificar credenciales válidas/expiradas, emisor/audiencia incorrectos e indisponibilidad con pruebas de contrato y documentar su traducción al actor interno (`identity-access`).
- [x] 4.2 Desarrollar modelo y casos de uso de asociaciones y contexto conforme a P1; verificar con pruebas de dominio/aplicación permisos, asociaciones vigentes y selección manipulada y documentar las reglas (`organizations`).
- [x] 4.3 Desarrollar persistencia organizacional por contratos; verificar mapeos y suites de contrato reales/de prueba con consultas, escrituras y recursos por identificador fuera del ámbito (`organizations`).
- [x] 4.4 Exponer las operaciones REST de identidad/contexto aprobadas; verificar autenticación, errores y matriz de acceso mediante pruebas de endpoints y actualizar OpenAPI (`identity-access`, `organizations`).

## 5. Configuration y Audit — requiere 4

- [x] 5.1 Desarrollar parámetros tipados y política efectiva conforme a P2; verificar valores inválidos, ausencia de configuración y efecto sobre facturas previas con reloj controlado y documentar la política (`configuration`).
- [ ] 5.2 Desarrollar el contrato y persistencia de trazabilidad conforme a P5, incluidos los mecanismos de confirmación/recuperación elegidos; verificar fallos parciales, registros distinguibles y deduplicación si existe entrega diferida, y documentar la garantía (`audit`).
- [ ] 5.3 Desarrollar los casos de uso y endpoints aprobados de configuración/auditoría; verificar permisos y acceso organizacional con pruebas de aplicación/REST y actualizar sus contratos OpenAPI (`configuration`, `audit`).

## 6. Fleet Management — requiere 4 y 5

- [x] 6.1 Desarrollar invariantes y casos de uso de activación, desactivación y asignaciones conforme a P4; verificar transiciones, permisos y conservación de historial con pruebas de dominio/aplicación y documentar la frontera del agregado (`fleet-management`).
- [x] 6.2 Desarrollar repositorios y la garantía de reemplazo de asignaciones; verificar contratos, persistencia MongoDB, fallos parciales y solicitudes concurrentes incompatibles, documentando la decisión atómica/transaccional (`fleet-management`, P7).
- [x] 6.3 Publicar el contrato de hechos de asignación y los endpoints de flota aprobados; verificar contexto, referencia temporal y ausencia de cambios retroactivos mediante pruebas de contrato/REST y actualizar OpenAPI (`fleet-management`).

## 7. Invoice Management — requiere 4, 5 y 6

- [x] 7.1 Desarrollar la creación MANUAL con origen estable y validación de asignación; verificar casos de uso con puertos de prueba y rechazo sin escritura ante asignación inválida o falta de permiso; documentar las invariantes (`invoice-management`).
- [x] 7.2 Desarrollar captura QR por adaptador y la política P3; verificar entrada válida/inválida, preservación del origen y rechazo de cambios QR protegidos, documentando los campos y excepciones aprobados (`invoice-management`).
- [x] 7.3 Desarrollar edición con ventana parametrizada y reloj inyectado; verificar dentro/fuera/borde, permiso insuficiente y contexto ajeno sin escrituras; documentar el comportamiento temporal (`invoice-management`, `configuration`).
- [x] 7.4 Desarrollar repositorio de facturas y coordinación de auditoría; verificar mapeos, aislamiento, conflictos concurrentes y garantía P5 con fallos simulados, documentando la confirmación de operaciones (`invoice-management`, `audit`).
- [x] 7.5 Exponer endpoints de facturación mediante controladores sin persistencia directa; verificar DTO, errores, acceso directo que omite UI y conformidad OpenAPI, actualizando el contrato publicado (`invoice-management`).

## 8. Módulos de frontend — requiere 3.5 y contratos de 4–7

- [x] 8.1 Desarrollar puertos, casos de uso y adaptadores HTTP de autenticación/contexto; verificar traducción de respuestas/errores sin importar modelos backend y documentar la selección de contexto (`identity-access`, `organizations`).
- [x] 8.2 Desarrollar vistas y estado de autenticación/contexto mediante composición React, Material UI y Zustand; verificar carga/éxito/error, cambio de contexto y ausencia de persistencia directa con pruebas de componentes (`organizations`, `project-foundation`).
- [x] 8.3 Desarrollar casos de uso y UI de vehículos/asignaciones; verificar adaptadores y componentes con dobles y pruebas de estados/transiciones, documentando la correspondencia `vehicles`/Fleet (`fleet-management`).
- [x] 8.4 Desarrollar casos de uso y UI de facturas MANUAL/QR y edición; verificar estados de captura y rechazo del servidor sin duplicar autorización ni política temporal autoritativa, con pruebas de aplicación/componentes y documentación de interacción (`invoice-management`).

## 9. Verificación integrada de aceptación — requiere 4–8

- [x] 9.1 Verificar recorridos integrados de contexto, reasignación de vehículo, creación/edición MANUAL, restricción QR e historial; aportar resultados que enlacen los escenarios de las siete capacidades con evidencias y sus contratos públicos.
- [x] 9.2 Verificar de extremo a extremo la matriz de autorización y el aislamiento de listados, identificadores y escrituras; confirmar que omitir controles de UI no concede acceso y registrar la evidencia (`identity-access`, `organizations`, `invoice-management`).
- [x] 9.3 Verificar ambas compilaciones, grafo de dependencias, sustitución de puertos y conformidad REST/OpenAPI tras integrar módulos; registrar resultados y resolver incumplimientos antes de solicitar aceptación (`project-foundation`).
