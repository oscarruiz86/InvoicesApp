# Tasks

Todas las casillas corresponden a implementación futura de `implement-company-management`. Las adaptaciones de Identity, transporte y entorno son exclusivamente las necesarias para empresas; no cierran tareas de otros cambios. Contrato funcional: `specs/company-management/spec.md`; decisiones y contratos precisos: `design.md`.

## 1. Persistencia transaccional y compatibilidad

- [x] 1.1 Preparar configuración replica set local y fixture MongoDB aislado para empresas, preservando volúmenes; verificar commit/abort multidocumento real y rechazo seguro de standalone, con instrucciones reproducibles en documentación de empresas.
- [x] 1.2 Incorporar comprobación read-only de organizaciones COMPANY legadas antes de habilitar el CRUD; verificar reporte sin secretos de IDs sin perfil compatible y bloqueo explícito de habilitación para datos no reconciliados, sin inventar NIT/email ni modificar asociaciones.
- [x] 1.3 Documentar configuración privada del módulo, inicialización no destructiva, prerrequisitos y reversión preservando datos/eventos; verificar que el procedimiento no resembrará política ni requerirá eliminar volúmenes.

## 2. Dominio y repositorio Company

- [x] 2.1 Crear Company y objetos de valor puros para ID, identificación, email y estado en Organizations; verificar unitarias de todos los campos, defaults, normalización, límites y metadatos del servidor.
- [x] 2.2 Definir puertos de repositorio/consulta y DTO de versión separados del agregado; verificar contratos de omisión/null, PATCH sin campos, campos inmutables, errores y ausencia de dependencias de frameworks en capas internas.
- [x] 2.3 Implementar esquema Mongoose companies e índices de diseño con traducción ObjectId/string y duplicado a conflicto; verificar integración de unicidad incluso con inactivas, conservación de ceros iniciales y altas concurrentes.
- [x] 2.4 Implementar escritura de proyección organizations con mismo id, nombre/estado y revisiones, sin reemplazar lectores existentes; verificar alta, edición de nombre y rollback conjunto en base real.
- [x] 2.5 Implementar consulta con scope antes de filtros/conteo/paginación, búsqueda literal escapada, orden estable y snapshot compartido; verificar resultados/total de A sin B, páginas vacías, filtros y planes explain representativos de los índices elegidos.

## 3. Confirmación autorizada y captura de auditoría

- [x] 3.1 Añadir puerto público de Identity para participar en confirmación de política mediante mutationFence y versión, conectado por bootstrap; verificar conflicto real con replace de política sin cambiar grants, versión semántica ni producir POLICY_CHANGED ficticio.
- [x] 3.2 Implementar unidad de trabajo de Organizations con sesión compartida, comprobación de recibos, CAS y escrituras de coordinación en organización/asociación habilitante; verificar abortos y reintentos acotados sin imports de modelos ajenos en capas internas.
- [x] 3.3 Implementar puerto/eventos company_management_events append-only con eventId único y captura transaccional; verificar payload mínimo, before/after permitidos, ausencia de secretos, no duplicación por reintento y rollback de datos cuando falla captura.
- [x] 3.4 Implementar ResourceAccessReader para empresas y asociaciones y matriz de permisos del diseño; verificar con unitarias los cuatro roles, grants retirados, roles combinados, scope global/local, autoasociación e IDs ajenos antes de exponer recursos.
- [x] 3.5 Documentar garantías y límites de confirmación/auditoría de empresas; verificar que diferencia captura durable de entrega futura y no afirma transacciones de Fleet/Invoices ni revocación instantánea de roles Keycloak.

## 4. Casos de uso de empresas y estado

- [x] 4.1 Implementar CreateCompany con autorización global, identidad de servidor, unicidad y evento atómico; verificar alta válida, obligatorios ausentes, duplicado y ausencia de asociación automática del creador.
- [x] 4.2 Implementar ListCompanies/GetCompany con lectura autorizada real; verificar paginación, búsqueda, filtros, alcance local de una empresa, 404 ajeno y consulta global de inactivas sin asociación local.
- [x] 4.3 Implementar UpdateCompany con expectedVersion, validación y actualización de perfil/proyección/evento; verificar edición permitida/denegada, cambio de identificación, conservación de creación, versión obsoleta y no-op sin evento adicional.
- [x] 4.4 Implementar SetCompanyStatus con companies:deactivate global para ambas transiciones; verificar autorización, repetición idempotente con versión vigente, proyección atómica y conservación de referencias/historial sin eliminación física.
- [x] 4.5 Integrar estado de empresas con lector de contextos existente; verificar con persistencia real exclusión/resolución rechazada tras desactivar, acceso global conservado, tercero independiente y reactivación sin restaurar asociaciones revocadas.
- [x] 4.6 Añadir pruebas de concurrencia con barreras de sincronización para edición frente a revocación de política, revocación de asociación y desactivación; verificar que ninguna escritura basada en evidencia anterior confirma después de la revocación y que abortar no deja evento de éxito.

## 5. Administradores de empresa

- [x] 5.1 Añadir puerto público de validación de destinatario y adaptador Keycloak de solo lectura por subject, con configuración privada de mínimo privilegio; verificar identidad habilitada/rol efectivo, inexistente, timeout y proveedor caído sin crear usuarios ni roles, y documentar configuración sin secretos.
- [x] 5.2 Implementar ListCompanyAdministrators paginado para APP_ADMIN con companies:read y associations:read; verificar solo asociaciones de la empresa solicitada, filtros activo/inactivo, versiones y rechazo de COMPANY_ADMIN sin exponer perfiles generales.
- [x] 5.3 Implementar AssociateCompanyAdministrator sobre asociación única existente/nueva; verificar permisos acumulativos, destinatario validado, rechazo de autoasociación/inactiva, reactivación del mismo ID, no-op y concurrencia sin duplicados.
- [x] 5.4 Implementar RevokeCompanyAdministrator conservando registro y capturando ASSOCIATION_REVOKED en la misma transacción; verificar acceso invalidado, asociación ajena oculta, revocación en empresa inactiva, último administrador y revocación de identidad ya ausente en Keycloak.

## 6. REST y OpenAPI

- [x] 6.1 Crear DTO Zod estrictos para cuerpos, IDs, scope, versiones y consultas; verificar parámetros desconocidos/duplicados, límites de paginación, null/opcionales, intento de inyectar metadatos y rechazo de scope omitido o tercero.
- [x] 6.2 Componer Route Handlers de listado/alta/detalle/PATCH/estado y administradores en bootstrap con autenticación existente; verificar pruebas HTTP de cada endpoint, permisos declarados en servidor, no-store, Location y ausencia de DELETE Company.
- [x] 6.3 Integrar errores 400/401/403/404/409/503/500, WWW-Authenticate y denegaciones limitadas existentes; verificar que no se filtran IDs ajenos, payloads, mensajes de MongoDB ni credenciales Keycloak.
- [x] 6.4 Extender backend/openapi/openapi.json con tag Companies, DTO, scopes, versiones y ejemplos de todas las respuestas; verificar `npm --prefix backend run openapi:lint` y pruebas HTTP contra el contrato, incluida visualización en Swagger.

## 7. Frontend de empresas

- [x] 7.1 Crear capas del módulo company-management y extender ProtectedHttp únicamente con rutas/métodos de empresas; verificar DTO, query/scope, cancelación, rechazo de destinos arbitrarios y categorías 400/409 sin guardar tokens en stores.
- [x] 7.2 Registrar rutas y navegación con guards de contexto/permisos actuales; verificar entrada global/local, rutas directas, acciones ocultas para roles no autorizados y acceso a creación solo con companies:create.
- [x] 7.3 Implementar listado responsive con búsqueda, filtros, orden, estado, paginación y carga/vacío/error/reintento; verificar cambio de filtros reinicia página y una respuesta obsoleta no sustituye la consulta vigente.
- [x] 7.4 Implementar formularios de alta/edición y vista de detalle con todos los campos del diseño; verificar validaciones, opcionales, errores de campo, bloqueo de doble envío y conflicto de versión con recarga explícita sin sobrescribir.
- [x] 7.5 Implementar confirmaciones de activar/desactivar y actualización desde respuesta confirmada; verificar cancelación sin solicitud, no-op, fallo sin éxito optimista y explicación de efectos sobre contextos/asociaciones.
- [x] 7.6 Implementar sección de administradores para APP_ADMIN con listado, entrada de subject, asociación y confirmación de desasociación; verificar elegibilidad por permisos, errores de destinatario/inactiva y conservación de cero administradores permitida.
- [x] 7.7 Integrar register/capture de contextStore, limpieza y liberación al desmontar; verificar formulario sucio, cambio/cancelación de contexto, logout, revocación y respuestas tardías, sin reintentar escrituras bajo otro scope.
- [x] 7.8 Verificar componentes a 360/1280 px con teclado, etiquetas, foco de diálogos y estados anunciados; incluir evidencia y guía breve de uso/errores en documentación del módulo, sin desbordamiento horizontal.

## 8. Aceptación integrada del incremento

- [x] 8.1 Ejecutar `npm --prefix backend run check`, `npm --prefix frontend run check` y builds de ambas aplicaciones; verificar límites arquitectónicos, regresiones de autenticación/contexto y compilación sin servicios activos.
- [x] 8.2 Ejecutar integración MongoDB real con MONGODB_TEST_URI de base aleatoria `_test` en replica set y pruebas de destinatarios contra Keycloak efímero; registrar resultados de unicidad, atomicidad, concurrencia, fallos y privacidad sin usar fixtures de runtime.
- [x] 8.3 Añadir/ejecutar aceptación navegador del ciclo crear/listar/editar/estado/asociar/revocar y COMPANY_ADMIN en A frente a B; verificar invalidación de contexto, permisos retirados, errores API y cambio de contexto durante solicitudes con backend real.
- [x] 8.4 Registrar evidencia que vincule cada requisito/escenario de company-management con sus verificaciones y límites observados; ejecutar validación estricta OpenSpec y confirmar que no se modificaron casillas de otros cambios ni se habilitaron módulos fuera de alcance.
