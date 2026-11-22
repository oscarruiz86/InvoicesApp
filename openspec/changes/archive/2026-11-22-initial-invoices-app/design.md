# Design

## Context

Ver `proposal.md` para la motivación. El diagnóstico inicial de esta propuesta era solo documental; la aplicación y sus especificaciones evolucionaron después mediante cambios independientes. El estado implementado, las decisiones funcionales y las evidencias se reconcilian en `docs/initial-invoices-app-closure.md` y en las especificaciones vigentes.

Los principios SOLID, DDD y Clean Architecture son obligatorios en frontend y backend y deben revisarse en cada tarea futura. Las decisiones enumeradas al final de este diseño ya fueron contrastadas con las especificaciones, documentación y capacidades implementadas citadas en el registro de cierre.

## Goals / Non-Goals

**Goals:** separar reglas de negocio de frameworks y persistencia, delimitar propiedad de datos, permitir pruebas independientes de servicios externos y proteger el contexto organizacional desde el backend.

**Non-Goals:** generar código, instalar dependencias, crear scaffolding ejecutable, cambiar funcionalidades, desplegar servicios o implementar módulos. No se prescribe una clase por concepto DDD, un contenedor de inyección, CQRS, event sourcing ni un bus de eventos.

## Decisions

### 1. Aplicaciones independientes y backend modular

El frontend será una aplicación React + Vite + TypeScript; Material UI resuelve presentación y Zustand estado de interfaz y aplicación. El backend será una aplicación Next.js + TypeScript que expone exclusivamente servicios REST y utiliza MongoDB/Mongoose y Keycloak mediante adaptadores. Swagger/OpenAPI documentará el contrato externo.

Cada aplicación tendrá configuración, dependencias, compilación y despliegue independientes. Se comunicarán por REST; compartir un repositorio no permite importar código interno del backend desde el frontend. Los contratos públicos podrán generar tipos en el futuro, sin compartir modelos Mongoose ni entidades de dominio.

Se propone un monolito modular para el backend porque los contextos requieren límites de responsabilidad, no despliegues separados. Se descartan microservicios en esta etapa por el costo de consistencia y operación sin una necesidad demostrada. Una separación futura requerirá justificación y una decisión de arquitectura revisada.

### 2. SOLID como criterios de revisión

| Principio | Aplicación obligatoria | Evidencia de conformidad futura |
| --- | --- | --- |
| S — Single Responsibility | Componentes presentan; casos de uso coordinan; entidades protegen invariantes; adaptadores traducen sistemas externos. | Una responsabilidad y motivo de cambio identificables por módulo, componente o servicio. |
| O — Open/Closed | Variantes de persistencia, HTTP, identidad y lectura QR se conectan por contratos específicos cuando hay una variación real. | Un adaptador de prueba sustituye al externo sin modificar las reglas de negocio. |
| L — Liskov Substitution | Todas las implementaciones respetan resultados, errores, aislamiento y garantías de sus puertos. | La misma suite de contrato se ejecuta sobre repositorios reales y de prueba. |
| I — Interface Segregation | Puertos pequeños por consumidor; evitar repositorios y servicios universales. | Los consumidores no requieren métodos ajenos a su caso de uso. |
| D — Dependency Inversion | Domain y Application definen o consumen abstracciones; Infrastructure implementa esas abstracciones. | Grafo de imports y pruebas internas sin frameworks, base de datos ni Keycloak. |

No se aceptan dependencias circulares, componentes con reglas complejas ni clases que mezclen HTTP, dominio y persistencia. Se prioriza composición de funciones y componentes; una abstracción se introduce para proteger un límite o una variación concreta, no para cumplir una cuota de patrones.

### 3. Bounded contexts y propiedad

| Contexto | Responsabilidad y propiedad | Límites y evaluación inicial |
| --- | --- | --- |
| Identity & Access | Identidad de usuario, roles y permisos generales; traducción de identidad autenticada desde Keycloak. | Contexto de soporte: no posee asociaciones organizacionales ni decide por sí solo acceso a una factura. Keycloak es infraestructura, no modelo de dominio compartido. |
| Organizations | Empresas, terceros, relaciones entre ellos, asociaciones de usuarios y validez del contexto seleccionado. | Es dueño de las relaciones organizacionales. Empresa y tercero tienen ámbitos separados; el acceso requiere una relación explícita activa, no una herencia jerárquica o tránsito implícito. |
| Fleet Management | Vehículos, conductores y asignaciones con períodos de vigencia e historial. | Un único contexto inicialmente porque comparten el ciclo de asignación. No incluye facturación ni modifica organizaciones. |
| Invoice Management | Facturas, origen MANUAL/QR y políticas de creación y edición. | Contexto central; consume hechos de asignación, permisos y parámetros mediante contratos, sin acceder a colecciones ajenas. |
| Configuration | Parámetros funcionales tipados, vigencia y ámbito de aplicación. | Contexto de soporte sencillo; no se convierte en motor genérico de reglas ni almacena secretos técnicos. |
| Audit | Registro y entrega durable de hechos de trazabilidad. | Contexto transversal de soporte; registra hechos y no autoriza operaciones ni modifica los agregados que observa. El historial no se consulta desde la aplicación hasta aprobar una política de acceso. |

Estos seis límites se revisaron y adoptaron para la arquitectura modular. No obligan a que cada contexto tenga UI propia, el mismo número de capas pobladas ni todos los patrones DDD.

**Mapa de colaboración:** Identity & Access aporta un actor autenticado a Application. Organizations aporta asociaciones y contexto autorizado; Fleet aporta hechos de asignación; Configuration aporta parámetros efectivos a Invoice Management. Los contextos productores entregan hechos de operaciones a Audit. Son relaciones entre contratos públicos, no imports entre modelos internos ni relaciones bidireccionales de agregados. Las dependencias deben mantenerse acíclicas.

Los servicios de aplicación consumidores definen puertos estrechos; adaptadores internos llaman las interfaces públicas del contexto proveedor. Las referencias entre agregados de contextos distintos son identificadores y, cuando sea necesario preservar historia, snapshots con significado explícito. Ningún contexto consulta ni escribe directamente los modelos o colecciones de otro.

### 4. Cuatro capas y dirección de dependencias

| Capa | Contenido | Dependencias permitidas |
| --- | --- | --- |
| Domain | Entidades, objetos de valor, invariantes, servicios y excepciones de dominio; contratos de repositorio de agregados cuando corresponda. | Su propio dominio y un núcleo compartido mínimo y puro. Sin dependencias de frameworks, Application, Infrastructure o Presentation. |
| Application | Casos de uso, coordinación, DTO internos, puertos externos, políticas de acceso de aplicación. | Domain y abstracciones internas. Sin imports de React, Next.js, Zustand, MUI, Mongoose, MongoDB o SDK de Keycloak. |
| Infrastructure | Repositorios, modelos Mongoose, mapeadores, clientes HTTP, adaptadores Keycloak, reloj y persistencia. | Application y Domain para implementar sus contratos. |
| Presentation | Páginas, componentes, hooks de interfaz, stores Zustand, controladores, validación de solicitudes y transformación de respuestas. | Contratos de Application y tipos internos necesarios; sin acceso directo a persistencia o adaptadores concretos. |

La regla de imports es `Presentation -> Application -> Domain` e `Infrastructure -> Application/Domain`. Presentation e Infrastructure no se importan entre sí. El punto de composición externo (`app/` en frontend y `bootstrap/` en backend) conoce los adaptadores y construye los casos de uso; las capas internas nunca importan ese punto de composición. El registro de rutas en `backend/src/app/api/` conecta controladores ya compuestos y solo realiza responsabilidades HTTP.

Las llamadas en ejecución pueden llegar a un repositorio concreto por un puerto inyectado; esto no invierte la dirección de las dependencias de código. Las excepciones de dominio no contienen códigos HTTP; Presentation las traduce a respuestas documentadas. Las invariantes pertenecen a entidades/objetos de valor y los controles que necesitan hechos externos se coordinan en Application.

Se usarán inyección explícita por constructor o función y factories cuando aporten desacoplamiento y capacidad de prueba. No se requiere un contenedor de dependencias. `shared/` no es un contexto de negocio ni un atajo para unir módulos.

### 5. Estructura conceptual del frontend

```text
frontend/
  src/
    app/                         # composición, rutas, providers
    modules/
      authentication/
        domain/
        application/
        infrastructure/
        presentation/
      organizations/
        domain/
        application/
        infrastructure/
        presentation/
      vehicles/                  # UI del contexto Fleet Management
        domain/
        application/
        infrastructure/
        presentation/
      invoices/
        domain/
        application/
        infrastructure/
        presentation/
    shared/
      components/                # presentación reutilizable
      hooks/                     # hooks de presentación
      utils/                     # utilidades puras, sin reglas de negocio
      theme/                     # Material UI, solo presentación
```

La estructura define los límites de frontend implementados en los módulos actuales. Configuration ofrece solo las pantallas funcionales aprobadas; Audit no expone historial en la UI mientras no exista política de lectura aprobada. `vehicles` es el nombre de interfaz para Fleet; no constituye un séptimo bounded context. Las pantallas de conductores y asignaciones permanecen dentro de ese límite compartido.

Los componentes invocan acciones de presentación conectadas a casos de uso. Los casos de uso dependen de puertos de API; los adaptadores HTTP implementan esos puertos y traducen DTO y errores. Los componentes no realizan HTTP ni persistencia directamente. Los stores Zustand quedan en Presentation y conservan selección, carga, errores y datos de aplicación; no definen reglas autoritativas ni contienen implementaciones de repositorios. Una necesidad de almacenamiento local se resuelve mediante un puerto y su adaptador.

Material UI, React y hooks no entran a Domain o Application. El dominio del frontend modela conceptos y restricciones locales útiles para la interacción, sin replicar la decisión autoritativa de permisos, aislamiento o elegibilidad de edición. Ocultar un botón es una ayuda visual: el servidor verifica de nuevo cada operación. Se prioriza composición y reutilización de componentes.

### 6. Estructura conceptual del backend

```text
backend/
  src/
    app/
      api/                       # Route Handlers REST delgados
    bootstrap/                   # composición e inyección de adaptadores
    modules/
      identity/
        domain/
        application/
        infrastructure/
        presentation/
      organizations/
        domain/
        application/
        infrastructure/
        presentation/
      fleet/
        domain/
        application/
        infrastructure/
        presentation/
      invoices/
        domain/
        application/
        infrastructure/
        presentation/
      configuration/
        domain/
        application/
        infrastructure/
        presentation/
      audit/
        domain/
        application/
        infrastructure/
        presentation/
    shared/
      domain/                    # identificadores y primitivas puras mínimas
      infrastructure/            # conexión y herramientas técnicas comunes
```

Los Route Handlers leen solicitudes, invocan controladores/casos de uso compuestos y devuelven respuestas. La validación de formato vive en Presentation; la validez de negocio se comprueba en Domain/Application. Ni rutas ni controladores utilizan modelos Mongoose. No se servirán páginas de producto desde Next.js; el frontend Vite consume REST.

### 7. Modelo táctico DDD proporcional

Los nombres siguientes son conceptos candidatos, no clases ni interfaces implementadas. Solo se materializarán cuando protejan una regla o un límite útil.

| Contexto | Entities, aggregates y aggregate roots candidatos | Value Objects y Domain Services candidatos | Repository Interfaces y Use Cases / Application Services |
| --- | --- | --- | --- |
| Identity & Access | Referencia de identidad local solo si necesita persistencia propia; no replicar cuentas y credenciales de Keycloak. | Identificador de actor, conjunto de permisos; política de permisos generales. | Puerto de verificación de identidad; obtener actor autenticado y consultar permisos. Sin repositorio local artificial. |
| Organizations | Organization como raíz; UserOrganizationAssociation como raíz separada si su ciclo de vida lo requiere. | OrganizationId, UserId, tipo de organización, contexto autorizado; política de asociación/acceso. | Contratos de organizaciones y asociaciones; asociar usuario, seleccionar y validar contexto. |
| Fleet Management | Vehicle como raíz del ciclo de vehículo; asignaciones bajo su frontera de consistencia. Driver como raíz separada si su ciclo de vida lo justifica. | VehicleId, DriverId, período de asignación, estado; política de transición de asignaciones. | Contratos de flota; activar/desactivar, cambiar tercero, asignar y consultar vigencia. |
| Invoice Management | Invoice como raíz; los datos dependientes forman parte de su consistencia. | InvoiceId, origen MANUAL/QR, ventana de edición y referencia de asignación; política de edición con hechos verificados. | Contrato de facturas y puertos de asignación, permisos, parámetros, auditoría y reloj; crear manual, capturar QR, editar y consultar. |
| Configuration | Parámetro funcional como raíz simple solo si requiere versionado y ciclo propio. | Clave, ámbito, valor tipado y vigencia. | Puerto de parámetros efectivos; consultar y modificar parámetros autorizados. |
| Audit | Registro de auditoría identificado, sin agregado complejo si basta persistencia inmutable. | Actor, instante, recurso, acción y correlación. | Puerto de escritura/consulta de trazabilidad; registrar hecho y consultar historial autorizado. |

Los Domain Services solo reúnen reglas que no pertenecen naturalmente a una entidad u objeto de valor; no hacen HTTP, autorización basada en SDK ni persistencia. Application Services implementan casos de uso y coordinan puertos sin absorber las invariantes de las entidades.

**Domain Exceptions:** categorías como asignación inválida, edición no permitida, transición inválida y contexto no autorizado describen el fallo con datos de dominio. Un fallo de conectividad no se disfraza de excepción de negocio. Presentation asigna respuestas HTTP coherentes y evita revelar datos de otra organización.

**Domain Events:** candidatos `InvoiceCreated`, `InvoiceModified`, `VehicleDeactivated`, `VehicleThirdPartyChanged` y `UserOrganizationAssociated` expresan hechos ya aceptados. Su necesidad se evaluará por consumidor real. Un puerto de auditoría invocado en el caso de uso puede bastar; no se exige un bus, un broker ni event sourcing.

### 8. Invariantes y coordinación de reglas críticas

**Invoice:** el origen MANUAL o QR se establece al crear y no cambia para eludir controles. Application obtiene una asignación verificada de Fleet, un contexto organizacional autorizado de Organizations y la política temporal efectiva de Configuration. Invoice evalúa sus invariantes con esos hechos y un instante proporcionado por un puerto de reloj; no consulta servicios externos por sí misma.

La creación valida el vehículo asignado; la edición manual exige permisos y estar dentro de la ventana configurada. El origen QR activa una restricción específica independiente de la ventana manual y permanece inmutable; no existe excepción privilegiada para editarlo. Cada modificación aceptada queda vinculada a auditoría. El backend toma la decisión final incluso si la UI permite la acción.

**Vehicle:** la activación/desactivación y el cambio de tercero son transiciones explícitas. Al sustituir una asignación se finaliza la anterior y se conserva su intervalo histórico; no se sobrescribe para aparentar que nunca existió. El reemplazo no deja asignaciones incompatibles simultáneamente. Desactivar un vehículo con una asignación activa se rechaza hasta cerrarla. Las facturas históricas no se reasignan por cambiar el tercero actual del vehículo.

**Organization:** las asociaciones de usuarios son hechos administrados por Organizations. Una selección enviada por el cliente es una solicitud de contexto, no prueba de autorización. Cada caso de uso verifica actor, rol/permiso, asociación vigente y ámbito del recurso. El contexto autorizado se pasa explícitamente a consultas y escrituras. No hay acceso global implícito por omitir un identificador ni excepciones administrativas transitivas.

### 9. Estrategia de repositorios y persistencia MongoDB

Los contratos que expresan almacenamiento de agregados pertenecen a Domain; puertos de consultas, reloj, autorización, parámetros y servicios externos pertenecen a Application cuando son necesidades del caso de uso. Evitar un repositorio CRUD universal y la exposición de consultas Mongoose, documentos, ObjectId, sesiones o errores del driver en los contratos internos.

Infrastructure implementa repositorios con Mongoose y mapeadores explícitos entre documentos y modelos internos. Cada módulo posee sus colecciones; los identificadores externos se traducen a tipos internos. Los filtros organizacionales se incluyen en lectura, escritura y búsquedas por identificador y se prueban contra accesos cruzados. Los índices refuerzan unicidad e integridad técnica; no sustituyen invariantes y autorización.

Cada actualización debe preservar la consistencia de su agregado frente a concurrencia. Para el cambio de tercero se evaluará un documento con actualización atómica o una transacción si las asignaciones se persisten por separado; nunca se cerrará una asignación dejando fallida la nueva. El caso de uso define la frontera requerida mediante una abstracción, sin importar sesiones MongoDB. Un conflicto concurrente no puede pasar silenciosamente como éxito.

La escritura de negocio y su auditoría no pueden perderse silenciosamente por un fallo parcial. Los cambios de política con entrega diferida capturan eventos en su outbox durable en la misma escritura atómica; el worker reintenta y deduplica por ID. Las operaciones de Organizations y otros cambios con auditoría local confirman registro y modificación dentro de su transacción MongoDB. No se introduce un broker. Las pruebas de repositorio/adaptador verifican estas garantías.

### 10. Integración con Keycloak y contexto organizacional

El adaptador de infraestructura valida identidad con emisor, audiencia, firma y expiración esperados y transforma claims a un actor interno mediante un puerto de Application. El dominio no conoce tokens, clientes, SDK, roles de realm ni modelos de Keycloak. El realm, cliente, permisos y flujo de sesión vigentes se documentan en P1 y P6.

Identity & Access entrega identidad y permisos generales; Organizations verifica asociaciones y contexto; cada caso de uso verifica el permiso sobre la acción y el recurso. No se aceptan roles, organización o identidad suministrados libremente en el cuerpo de una petición como evidencia. La UI nunca tiene acceso directo a MongoDB ni credenciales de servicio. Si hay indisponibilidad de identidad o de contexto, no se autoriza por defecto.

### 11. Contratos REST y Swagger/OpenAPI

Presentation define DTO de solicitudes y respuestas separados de entidades y persistencia. OpenAPI publica operaciones, esquemas, campos obligatorios, origen de factura, selección explícita de contexto, seguridad y errores de validación, autenticación, autorización, recurso ausente, indisponibilidad y conflictos de dominio/concurrencia. El mapeo vigente está en el contrato publicado; no se exponen modelos Mongoose ni detalles de Keycloak.

Swagger expondrá documentación del contrato y las pruebas de endpoints contrastarán entradas, salidas y errores con él. El contrato no filtra modelos Mongoose ni detalles de Keycloak. Los clientes HTTP del frontend implementan puertos específicos de cada módulo y convierten errores del transporte en resultados útiles para la aplicación/presentación.

### 12. Estrategia de pruebas y validación arquitectónica

| Capa o límite | Pruebas exigidas antes de aceptar implementación |
| --- | --- |
| Domain, frontend y backend | Entidades, objetos de valor e invariantes sin React, Next.js, MongoDB o Keycloak. En frontend solo reglas locales; en backend las reglas autoritativas. |
| Reglas críticas | Asignación inválida, origen inmutable, edición MANUAL dentro/fuera y en borde de ventana, restricción QR, cambios de tercero, desactivación e historial. |
| Application, ambas aplicaciones | Casos de uso con repositorios/adaptadores en memoria, reloj controlado y puertos de prueba; coordinación, errores y ausencia de escrituras al rechazar. |
| Infrastructure: repositorios | Suites de contrato compartidas con dobles; integración MongoDB sobre mapeo, aislamiento organizacional, atomicidad y conflictos concurrentes. |
| Infrastructure: adaptadores | Identidad válida/expirada/incorrecta, indisponibilidad del proveedor, traducción HTTP y parámetros; dobles externos en pruebas deterministas. |
| Presentation backend | REST y conformidad OpenAPI, validación, errores, autenticación, permisos y recursos de otra organización. |
| Presentation frontend | Componentes, composición, estados Zustand, carga/éxito/error y selección de contexto usando casos de uso de prueba. |
| Transversal | Matriz de autorización por rol, asociación, contexto y acción; acceso por identificador/listado/escritura; modificaciones confirmadas con trazabilidad recuperable. |
| Arquitectura | Grafo de imports sin ciclos, límites entre módulos/capas, prohibición de frameworks en capas internas y pruebas de sustitución de puertos. |

La validación automatizada usa Vitest, Dependency Cruiser, OpenAPI lint, builds independientes y pruebas de integración y navegador. Las cantidades y resultados registrados se encuentran en `docs/initial-invoices-app-closure.md` y en los cambios OpenSpec de auditoría. Cada capacidad aporta evidencia de conformidad SOLID/DDD/Clean Architecture; crear carpetas por sí solo no se acepta como evidencia.

## Risks / Trade-offs

- [Sobreingeniería DDD] → Introducir solo agregados, servicios, eventos y puertos con una regla o consumidor real; mantener Configuration y Audit sencillos.
- [Reglas duplicadas en la UI] → Backend autoritativo y frontend con validación local de interacción; probar solicitudes directas que omiten controles visuales.
- [Fuga entre organizaciones] → Contexto validado por operación, puertos con ámbito explícito y pruebas negativas de consultas y escrituras.
- [Historial inconsistente o pérdida de auditoría] → Definir frontera atómica/durable y verificar fallos parciales y concurrencia antes de aceptar esos módulos.
- [Dependencias ocultas por carpetas compartidas] → Núcleo compartido mínimo, contratos públicos y revisión del grafo de imports.
- [Reglas funcionales requieren decisión de producto] → P1–P7 quedan documentadas y ligadas a sus especificaciones; las extensiones futuras deberán seguir el mismo proceso de aprobación.

## Migration Plan

En la inspección inicial no había código ni datos disponibles que migrar. Las capacidades se implementaron después en cambios separados y se integraron en `development`, sin que esta revisión altere datos o despliegue servicios. Las siete deltas se sincronizaron con sus especificaciones base y la propuesta se archivó el 22 de noviembre de 2026.

## Decisiones acordadas y trazabilidad

| ID | Decisión vigente | Evidencia principal |
| --- | --- | --- |
| P1 | `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER` tienen grants y ámbitos explícitos, sin herencia implícita. La autorización combina permiso, asociación activa y propietario del recurso. | `docs/authorization.md`, `docs/assignment-management.md`, `openspec/specs/identity-access/spec.md`, `openspec/specs/organization-context/spec.md`. |
| P2 | `invoice.manual-edit-window-seconds` es entero global de 1 a 31.536.000 segundos (inicial 43.200); el borde es exclusivo desde `createdAt`, usa reloj del servidor y afecta facturas existentes. Si falta política válida, falla cerrado. | `openspec/specs/configuration/spec.md`, `docs/parameter-management.md`, `backend/src/modules/invoices`. |
| P3 | QR v1 requiere los campos DIAN documentados; CUFE y URL HTTPS son opcionales. La lectura y validación son locales. Facturas QR son inmutables y la captura no certifica autenticidad fiscal. | `docs/invoice-qr-scanning.md`, `docs/invoice-management.md`, `openspec/specs/invoice-qr-scanning/spec.md`. |
| P4 | La asignación propia y activa se confirma en el punto de escritura; Fleet conserva historial y referencias sin reescritura retroactiva. Desactivar con asignación activa se rechaza; las mutaciones verifican revisiones dentro de transacción. | `docs/assignment-management.md`, `docs/vehicle-management.md`, `docs/invoice-management.md`, `openspec/specs/driver-vehicle-assignment/spec.md`. |
| P5 | Audit almacena eventos normalizados append-only, idempotentes, sin credenciales ni payloads libres. La retención aprobada es de dos años desde `occurredAt`; la expiración TTL puede retrasarse, nunca adelantarse. El outbox captura antes de responder y reintenta hasta entregar. No existe endpoint de historial y `audit:read` permanece denegado hasta aprobar acceso de consulta. | `docs/audit.md`, `openspec/changes/implement-audit-delivery/design.md`, `openspec/changes/implement-audit-delivery/specs/audit/spec.md`, `openspec/changes/capture-keycloak-admin-events/design.md`. |
| P6 | Keycloak usa realm `invoices`, cliente público `invoices-web`, Authorization Code con PKCE S256 y audiencia `invoices-api`; el backend valida issuer, firma, audiencia y vigencia. No hay asignaciones de rol por defecto ni passwords gestionados por la aplicación. | `docs/authentication.md`, `keycloak/invoices-realm.json`, `openspec/specs/identity-access/spec.md`. |
| P7 | OpenAPI 3.1 publica DTO cerrados, Bearer, contexto y errores. Escrituras sensibles comprueban propiedad/revisiones dentro de transacciones; fallos y conflictos no producen éxito parcial. La auditoría diferida usa outbox durable y deduplicación por ID. | `backend/openapi/openapi.json`, `docs/authorization.md`, `docs/assignment-management.md`, `docs/audit.md`. |

La solicitud del usuario del 22 de noviembre de 2026 autoriza completar esta propuesta, implementar las tareas restantes y crear un commit en `openspec/initial-invoices-app`. Se validarán los artefactos OpenSpec antes de cerrar las tareas. La ausencia de una política de lectura de Audit es una decisión explícita de privacidad y alcance, no una tarea de endpoint pendiente.
