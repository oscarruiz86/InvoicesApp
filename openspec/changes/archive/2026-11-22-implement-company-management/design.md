# Design

## Context

Ver motivación en `proposal.md`. Evidencia revisada:

| Fuente existente | Consecuencia para este incremento |
| --- | --- |
| `docs/architecture.md` | Organizations es propietario de empresas y asociaciones; Domain/Application no importan Mongoose, Zod, Next ni React. Composición en bootstrap/app. |
| `backend/src/modules/organizations/infrastructure/mongodb/organization-repository.ts` | Ya existen `organizations`, `organization_associations`, `company_third_party_relations`, índices, revisiones y lector de hechos. No existe escritor administrativo ni Company. |
| `backend/src/modules/identity/domain/permissions.ts` y `authorization-policy.ts` | Catálogo y techo existentes; APP_ADMIN global, COMPANY_ADMIN local; delegación de administradores de empresa solo por APP_ADMIN y nunca al propio actor. |
| `authorization-ports.ts` | ResourceAccessReader filtra antes de contar/paginar; AuthorizedMutation exige comprobar revisiones al confirmar, pero no implementa transacciones. |
| `policy-repository.ts` | Política versionada con reemplazo atómico de documento. Es necesario coordinar su revisión con escrituras de empresas. |
| `docs/organization-context.md` y `context-store.ts` | Proveedor organizacional conectado, revisión sin caché positiva, registro de formularios y captura/cancelación de solicitudes ya disponibles. |
| `protected-http.ts` | Transporte limitado a rutas conocidas y GET/POST; debe extenderse acotadamente para este CRUD. |
| `compose.yaml` | MongoDB standalone; no sirve aún para la confirmación multidocumento requerida. |

`docs/authorization.md` conserva frases previas a la conexión de Organizations; para ese punto prevalecen el bootstrap actual y `docs/organization-context.md`. Las propuestas `implement-authentication`, `implement-authorization`, `implement-organization-context` y la base `initial-invoices-app` se usan como contratos de dependencia, no como tareas de este cambio. Las specs principales de foundations describen su alcance inicial; este incremento agrega una capacidad de negocio separada sin reescribir su historia.

## Goals / Non-Goals

**Goals:** una única fuente de datos tributarios; compatibilidad de IDs y lectores organizacionales; escrituras autorizadas y auditadas sin resultados parciales; consultas y UI aisladas por contexto.

**Non-Goals:** servicio genérico de usuarios, asignación de roles, nuevo sistema de permisos, nuevo selector, migración automática de datos organizacionales incompletos, CRUD de dependencias o plataforma completa de auditoría. Las adaptaciones compartidas se limitan a lo indispensable para empresas.

## Decisions

### 1. Company dentro de Organizations y proyección compatible

Company será agregado del módulo backend `organizations`; no se crea otro contexto propietario. Domain define entidad y objetos de valor puros para ID, identificación tributaria, correo y estado. Application define repositorio, consulta, unidad de trabajo autorizada, auditoría y casos Create/List/Get/Update/SetStatus/ListAdministrators/AssociateAdministrator/RevokeAdministrator. Infrastructure implementa Mongoose y adaptadores; Presentation valida DTO Zod y traduce HTTP. Bootstrap conecta contratos de Identity sin acceder a modelos ajenos desde Application.

`companies._id` será ObjectId generado por servidor; Domain/REST usan cadena hexadecimal de 24 caracteres. `organizations.id` conserva su tipo String y, para nuevas empresas, equivale a ese ObjectId serializado. Su `type=COMPANY`, `name=businessName`, `active=(status===ACTIVE)`. Ambas colecciones son propiedad de Organizations. Company es fuente del perfil; organizations es proyección compatible para acceso. Se crean/actualizan atómicamente; nunca dos escrituras con sincronización eventual. Una edición incrementa revisiones de Company y organización, incluso si no cambia nombre/estado.

Se descarta reemplazar `organizations` por `companies`: rompería lectores y referencias de terceros existentes. Se descarta guardar empresas solo en `organizations`: no cumple colección y modelo solicitados. No se renumeran IDs organizacionales legados opacos ni se inventa NIT/email para ellos.

### 2. Modelo, validaciones e índices

| Campo | Persistencia / obligatoriedad | Regla |
| --- | --- | --- |
| id | ObjectId / sí | `_id` automático; DTO `id` |
| documentType | String / sí | Únicamente NIT; default NIT si se omite al crear |
| documentNumber | String / sí | Trim, 1–20 dígitos, sin separadores ni DV, conserva ceros iniciales |
| verificationDigit | String / no | Un dígito; no se calcula ni valida algoritmo DIAN en este alcance |
| businessName | String / sí | Trim, 1–256 caracteres |
| tradeName | String / no | Trim, máximo 256 |
| email | String / sí | Trim, minúsculas, formato email, máximo 254 |
| phone | String / no | Trim, máximo 32; texto, admite prefijo internacional |
| address | String / no | Trim, máximo 256 |
| country, department, city | String / no | Trim, máximo 128 cada uno; sin catálogo geográfico nuevo |
| status | Enum / sí | ACTIVE o INACTIVE; default ACTIVE, solo operación dedicada |
| createdAt, updatedAt | Date / sí | Reloj servidor UTC; inicialmente iguales |
| createdBy | String / sí | Subject Keycloak verificado, inmutable |
| updatedBy | String / no | Null al crear; actor verificado de la última modificación |

Opcionales vacíos se normalizan a null; PATCH distingue omisión (conservar) y null (limpiar opcional); null en obligatorios se rechaza. PATCH exige al menos un campo editable. Esquemas cerrados, sin mass assignment. No se considera email ni businessName identificador único. El estado no se modifica con PATCH de perfil.

Metadatos internos adicionales: `revision` entero positivo, y claves normalizadas de búsqueda `businessNameSearch`, `tradeNameSearch` (minúsculas tras trim). No se devuelven estas claves ni administradores dentro del DTO Company. La versión se expone como cadena opaca `version` en el envelope, separada del perfil.

Índice único compuesto `{documentType:1, documentNumber:1}` no parcial: incluye inactivas. Índices iniciales `{status:1,businessNameSearch:1,_id:1}`, `{documentNumber:1,_id:1}`, `{businessNameSearch:1,_id:1}`, `{tradeNameSearch:1,_id:1}` y `{createdAt:-1,_id:1}`. Búsqueda q de 1–100 caracteres normalizada, literal por prefijo con expresión escapada/anclada; nunca regex suministrada por cliente. Filtros geográficos exactos tras trim. Orden permitido businessName, documentNumber, createdAt, updatedAt y status, con id como desempate ascendente. Default createdAt descendente; page=1/pageSize=20, máximo 100. No se promete cobertura de índice para toda combinación: verificar explain sobre consultas representativas y evitar índices geográficos especulativos.

### 3. Matriz de operaciones sin nuevos permisos

| Operación | Actor y ámbito | Permisos acumulativos |
| --- | --- | --- |
| Crear | APP_ADMIN/global | companies:create |
| Listar/detalle | APP_ADMIN/global o COMPANY_ADMIN/empresa activa asociada | companies:read |
| Editar perfil | Mismos ámbitos | companies:update |
| Activar/desactivar | APP_ADMIN/global | companies:deactivate |
| Consultar administradores | APP_ADMIN/global | companies:read + associations:read |
| Asociar/reactivar administrador | APP_ADMIN/global | companies:read + users:associate + associations:manage |
| Desasociar | APP_ADMIN/global | companies:read + associations:manage |

`companies:deactivate` controla ambas transiciones de estado porque el catálogo actual no tiene activate; la UI etiqueta la acción concreta. El permiso associations:read/manage de COMPANY_ADMIN corresponde a terceros en el contrato previo, no autoriza este listado ni la delegación de pares. No se amplía ese techo silenciosamente.

Todos los endpoints exigen query `scope=global` o `scope=organization&companyId=<id>`. No aceptan self ni thirdPartyId. APP_ADMIN en contexto local no hereda permisos globales; debe cambiar a GLOBAL. El listado local muestra solo la empresa seleccionada: el selector existente sirve para cambiar entre empresas asociadas. Omitir scope es 400. Primero autenticar y validar scope/permiso; luego buscar recurso dentro del alcance. Contexto inválido es 403; ID ajeno/inexistente con contexto válido es 404 neutro. Crear no requiere asociación previa ni asocia al creador.

ResourceAccessReader de Organizations devuelve hechos companies y asociaciones reales; para nuevos recursos se construyen hechos candidatos del servidor y se confirma autorización dentro de la unidad de trabajo. Nunca se reutiliza el cuerpo HTTP como ResourceFacts. Conteo y items comparten filtro autorizado y snapshot de lectura para evitar totales inconsistentes. No se enumeran otras empresas para después filtrar en memoria.

### 4. Contrato REST

Todas las rutas bajo `/api/companies`, Bearer JWT, JSON y `Cache-Control:no-store`. Scope va en query en todas las operaciones; los filtros solo en GET de lista. `id` mal formado es 400, válido fuera de alcance es 404.

| Método/ruta | Entrada adicional | Éxito |
| --- | --- | --- |
| GET `/` | page, pageSize, q, status, documentType, country, department, city, sort, direction=asc/desc | 200 `{items:[{company,version}],page,pageSize,total}` |
| POST `/` | Campos de alta | 201 `{company,version}` y Location |
| GET `/{id}` | Ninguna | 200 `{company,version}` |
| PATCH `/{id}` | `{expectedVersion,changes:{...campos editables}}` | 200 `{company,version}` |
| POST `/{id}/status` | `{expectedVersion,status}` | 200 `{company,version}` |
| GET `/{id}/administrators` | page/pageSize y active=true/false opcional; por defecto todos | 200 `{items:[{associationId,subject,capability,active,version}],page,pageSize,total,companyVersion}` |
| POST `/{id}/administrators` | Retirado por implement-user-invitations | No crea ni reactiva acceso; usar invitaciones |
| POST `/{id}/administrators/{associationId}/revoke` | Sustituido por gestión de membership | Aplicar revisión y protección del último administrador |

Asociaciones paginadas con orden estable subject/associationId; no se expone directorio general ni perfil personal. El campo subject destinatario no reemplaza nunca al actor. La versión de Company también aumenta ante cambios reales de asociaciones; facilita concurrencia de la pestaña de administradores. No-op con versión vigente devuelve estado actual sin modificar fechas ni emitir transición; versión obsoleta es conflicto incluso para no-op. Se rechaza retirar al último administrador de una organización operativa incluso ante concurrencia; una nueva sin administradores admite incorporación por invitación. IDs de asociación mantienen el formato opaco existente.

Errores: 400 INVALID_REQUEST (errores seguros por campo, sin valores recibidos); 401 UNAUTHENTICATED con WWW-Authenticate; 403 FORBIDDEN; 404 RESOURCE_NOT_FOUND; 409 COMPANY_DOCUMENT_CONFLICT, COMPANY_VERSION_CONFLICT, COMPANY_INACTIVE; 400 INVALID_ADMINISTRATOR para destinatario inexistente/deshabilitado/sin rol, 403 para autoasociación; 503 AUTHORIZATION_UNAVAILABLE, IDENTITY_UNAVAILABLE o COMPANY_STORAGE_UNAVAILABLE según dependencia, y CONFIGURATION_ERROR según contrato existente; 500 INTERNAL_ERROR. Contención no convergente se informa 503 sin éxito. OpenAPI 3.1 documenta DTO cerrados, límites, errores, scopes y ejemplos; no habrá DELETE de Company.

### 5. Identidades destinatarias y asociaciones

Contrato reconciliado con `implement-user-invitations`: el alta por subject se sustituye por invitación por correo y aceptación explícita. Se conserva organization_associations como asignaciones vinculadas a Membership, con ambas activas para acceso. Los roles locales no requieren realm_access. Registro y perfil propio residen en Keycloak; la consulta autorizada de perfil comparte solo nombre completo, tipo y número documental y correo. No se crean identidades desde empresas.

Los IDs y estados legados se conservan mediante migración LEGACY sin inventar aceptación. Usuarios activos gestionan roles sin reinvitación, con al menos uno compatible; suspender/reactivar requiere revisión y protección del último administrador. El historial de invitaciones no autoriza consulta de perfil. Las rutas antiguas de escritura se retiran coordinadamente con los lectores y frontend.

### 6. Transacción y serialización real de autorización

Usar replica set MongoDB (local de un nodo para desarrollo/pruebas), sesión transaccional snapshot y commit con write concern majority/journal. Una transacción que solo lee política/asociaciones y escribe Company no evita write skew: se requiere participación de escritura en los documentos que condicionan la decisión.

Unidad de trabajo compuesta por bootstrap, con puertos opacos a la sesión en capas internas:

1. Obtener actor validado y, para asociación, comprobación del destinatario. Abrir transacción; releer política y hechos organizacionales a través de adaptadores participantes de la misma sesión.
2. Identity implementa una operación pública de confirmación de política: comprobar versión esperada y realizar incremento real de campo técnico `mutationFence` en el documento active, sin cambiar grants, versión semántica ni generar POLICY_CHANGED. Esto entra en conflicto con cualquier reemplazo concurrente del mismo documento. Organizations no importa ni escribe directamente el modelo de Identity.
3. Comprobar recibo/revisiones y permisos efectivos dentro de la transacción. Tocar mediante actualización condicional real la organización y asociación habilitante cuando sean necesarias (campo técnico mutationFence separado de revision). Los escritores de revocación actualizan esos mismos documentos; las operaciones globales también coordinan el documento de organización/Company objetivo.
4. Aplicar CAS de Company con expectedVersion, escribir perfil/proyección/asociación, incrementar revisiones semánticas solo por cambio real y capturar evento en la misma transacción. Creación usa ID generado y unicidad; el bloqueo de política también aplica a altas.
5. Confirmar antes de devolver éxito. Ante write conflict, reintentar de forma acotada (hasta tres intentos) toda evaluación con hechos frescos; nunca reutilizar recibo favorable. Si revocación ya confirmó, denegar; si cambió versión del recurso, 409. Un resultado de commit incierto se resuelve con la sesión/identidad del intento, sin repetir ciegamente la mutación desde UI.

La contención global de política es un coste aceptado para este CRUD administrativo de bajo volumen. No se construye un coordinador para todos los módulos. La garantía se demuestra con barreras de concurrencia en MongoDB real para revocación de asociación, política y desactivación, sin marcar pruebas pendientes de Fleet/Invoices como resueltas.

### 7. Estado e historial de recursos dependientes

Desactivar cambia Company y organizations en una confirmación; conserva associations.active, relaciones y recursos. El lector actual bloquea cualquier scope que requiera empresa inactiva; no necesita nuevas sesiones de contexto. No desactiva automáticamente terceros ni sus contextos independientes, ni altera vehículos/facturas. El módulo no implementa escrituras de esos propietarios; los contratos existentes exigirán validar su contexto cuando existan.

Reactivar vuelve elegibles asociaciones que permanecen activas, sujetas a roles/permisos actuales; una asociación revocada explícitamente no se reactiva. Global puede editar perfil de inactiva. La UI revalida contextos ante éxito de estado, 403 y ciclo existente; no se añade push ni se afirma borrar de inmediato una pantalla remota. La siguiente decisión backend observa la desactivación confirmada.

### 8. Captura durable acotada

Puerto de eventos de Company; colección productora `company_management_events`, con eventId único, at, subject, action, result, correlationId, scope seguro, companyId, asociación/targetSubject cuando aplique, beforeVersion/afterVersion, changedFields y valores before/after de campos permitidos. Acciones COMPANY_CREATED, COMPANY_UPDATED, COMPANY_ACTIVATED, COMPANY_DEACTIVATED, COMPANY_ADMIN_ASSOCIATED y ASSOCIATION_REVOKED. Captura append-only dentro de la transacción, sin muestreo; índice companyId/at/eventId para trazabilidad. Datos de contacto históricos permanecen privados; no copiar cuerpos completos, tokens, claims ni credenciales.

`delivered:false` reserva entrega futura, siguiendo el patrón de contexto pero sin escribir eventos de empresa en `organization_context_events`. eventId estable durante reintentos internos evita duplicación. Si falla captura, abortar. No-ops no generan transición. Denegaciones usan SecurityAudit limitado existente; nunca registran IDs ajenos no validados ni fallan de modo permisivo. No se agrega API audit:read, consumidor, retención o tareas de otro módulo.

### 9. UI y transporte

Nuevo `frontend/src/modules/company-management` con Domain/DTO puros, casos/puertos Application, adaptador REST Infrastructure y componentes/estado Presentation. Rutas `/companies`, `/companies/new`, `/companies/:id`, `/companies/:id/edit`; sección de administradores en detalle visible solo para global autorizado. Reutilizar Material UI Table, formularios, Dialog, Alert y paginación; no añadir librería de grid. Registro de navegación condicionado por companies:read; crear requiere su grant específico. Formularios de todos los campos del modelo editable con validación, errores de campo, bloqueo durante envío y manejo de 409 sin sobreescritura automática.

Extender ProtectedHttp con métodos/rutas parametrizadas validadas, query, PATCH y respuestas 400/409; mantener destinos conocidos, timeout, no redirects, cancelación y tokens exclusivamente en adaptador. Nunca abrir un transporte a URLs arbitrarias. Reutilizar guards, authorizationStore y contextStore.register/capture; limpiar stores y formularios al cambiar sesión/contexto, liberar registros al desmontar y publicar solo si isCurrent(). Cancelar no garantiza revertir escritura recibida; no reintentar una mutación automáticamente con otro scope.

Confirmación explícita de activar/desactivar y desasociar, indicando efectos. Búsqueda reinicia página, estados carga/vacío/error con reintento; no mostrar éxito optimista para cambios administrativos. A 360/1280 px: tarjetas o tabla adaptable sin desbordamiento, etiquetas, errores asociados a campo, diálogos con foco gestionado y controles táctiles de al menos 44 px.

## Risks / Trade-offs

- Proyección duplicada de nombre/estado → misma transacción, prueba de rollback y detección de desalineación; nunca sincronización eventual.
- MongoDB standalone existente → prerrequisito replica set y comprobación explícita; sin fallback no transaccional ni reinicio destructivo de volúmenes.
- Datos COMPANY legados sin NIT/email → inventario read-only previo; no convertir ni ocultar la necesidad de reconciliación. Si hay datos reales, bloquear habilitación del CRUD para esos datos hasta acordar/importar un mapeo completo en trabajo separado.
- Contención del documento de política → reintentos acotados y evidencia concurrente; optimización solo si mediciones de este módulo lo requieren.
- Credencial de lectura Keycloak → mínimo privilegio, configuración exclusivamente servidor, tiempos finitos y prueba de indisponibilidad; no ampliar a administración de identidades.
- Eventos con datos de contacto → colección privada sin endpoint, campos explícitos y acceso administrativo a almacenamiento; política integral de retención pertenece a Audit futuro.
- Cambios previos sin archivar y algunas tareas pendientes → consumir código presente, preservar sus artefactos y documentar límites; no declarar implementados módulos futuros.

## Migration Plan

1. En implementación, preparar replica set local/pruebas y verificar transacciones; preservar volúmenes y documentar respaldo/conversión del entorno existente. No desplegar infraestructura remota.
2. Inventariar organizaciones COMPANY y comprobar si hay IDs/datos legados que necesiten reconciliación. Pruebas usan únicamente bases aleatorias `_test`, nunca desarrollo como fixture. No crear empresas de relleno.
3. Crear colecciones/índices y campo técnico de confirmación de política compatible con documentos existentes (incremento desde ausencia); no resembrar grants ni versiones. Probar rollback sin borrar historial.
4. Configurar lector Keycloak, conectar casos/REST y habilitar UI después de pasar integración real, OpenAPI y aceptación. Empresa nueva empieza sin administradores.
5. Reversión: deshabilitar nuevas rutas/UI y preservar companies, proyecciones, asociaciones y eventos. Los lectores previos conservan organizaciones y estados. No borrar colecciones ni revertir revocaciones para volver de versión. Estas son instrucciones para la implementación futura; esta propuesta no ejecuta migraciones.
