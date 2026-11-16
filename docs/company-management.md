# Administración de empresas

La UI de empresas está integrada en las rutas y navegación existentes, protegida por autenticación, contexto y permisos efectivos. El backend mantiene el prerrequisito de réplica para aceptar escrituras transaccionales.

## Uso de la interfaz

En el menú **Empresas**, APP_ADMIN puede buscar por nombre o documento, filtrar estado y ubicación, ordenar y cambiar la página. **Crear empresa** aparece con `companies:create`; el formulario valida identificación, razón social y correo antes de enviar, y los campos opcionales vacíos se guardan como null. El detalle permite editar con la versión cargada. Activar/desactivar y desasociar administradores requieren confirmación; cancelar no envía cambios. La sección de administradores aparece con `companies:read` y `associations:read`; asociar además requiere `users:associate` y `associations:manage` y la empresa debe estar activa.

Ante identificación duplicada, revisar el NIT indicado; ante `COMPANY_VERSION_CONFLICT`, usar **Recargar datos** y volver a aplicar los cambios conscientemente. Si Keycloak rechaza el subject, confirmar que el usuario existe, está habilitado y tiene el rol requerido. Los errores de conexión ofrecen reintento explícito. Los controles administrativos no conceden contexto operativo ni permisos en otros módulos.

## MongoDB local

El CRUD requiere replica set para confirmar Company, organización, asociaciones y eventos atómicamente. El Compose local inicia MongoDB como replica set de un nodo y el healthcheck inicializa exclusivamente un conjunto aún no inicializado; no reconfigura conjuntos existentes. Se conserva el volumen `mongodb-data`; no ejecutar `down -v`. Antes de cambiar datos existentes, detener las aplicaciones y obtener un respaldo verificable con las herramientas MongoDB del entorno.

Compose conecta por `mongodb://mongodb:27017/invoices_app?replicaSet=invoices-rs`. Para backend ejecutado en el host, configurar MONGODB_URI con `mongodb://127.0.0.1:27017/invoices_app?replicaSet=invoices-rs&directConnection=true` (adaptar el puerto publicado). No publicar MongoDB fuera de loopback. La comprobación exige PRIMARY y replica set; no hay fallback a escrituras no transaccionales.

`node scripts/test-company-storage.mjs` crea dos contenedores temporales sin volúmenes de desarrollo, uno replica set y otro standalone, con puertos libres y bases aleatorias `_test`. Comprueba commit/abort y rechazo de standalone; al terminar elimina exclusivamente sus contenedores y bases. Requiere Docker y dependencias backend ya instaladas.

## Compatibilidad e inicialización

`companyReadiness` inspecciona en modo lectura organizaciones COMPANY sin Company con el mismo ObjectId serializado. Devuelve únicamente IDs incompatibles para diagnóstico administrativo; la API no debe exponer el informe. `requireCompanyStorage` bloquea habilitación en ese caso. No genera NIT/email ficticios, no renumera IDs y no modifica asociaciones. Datos legados requieren reconciliación acordada antes de habilitar este CRUD. El inventario no es un endpoint público.

La asociación de administradores consulta una identidad Keycloak existente mediante el cliente confidencial de solo lectura `KEYCLOAK_DIRECTORY_CLIENT_ID` y `KEYCLOAK_DIRECTORY_CLIENT_SECRET`. `KEYCLOAK_DIRECTORY_ISSUER_URL` puede usar una dirección interna de red para contactar el mismo realm; su ruta debe coincidir con `KEYCLOAK_ISSUER_URL`, que se conserva como issuer público para validar JWT. Compose usa `http://keycloak:8080/realms/invoices`, mientras el backend ejecutado en el host usa el issuer local. El service account requiere `realm-management:query-users` y `realm-management:view-users`, asignados solo a ese cliente. También debe tener adjunto el scope `company-directory-admin` (incluido en `keycloak/invoices-realm.json`), que limita al cliente la emisión de esos roles, y el scope integrado `kc-admin-api`, necesario en Keycloak 26.8+ para la audiencia y autorización de Admin REST. No habilitar service accounts en el cliente web. El ID y el secreto se proporcionan al backend en `backend/.env.local` u otro gestor de secretos y nunca al navegador, repositorio o logs. Sin configuración o si Keycloak no responde, la asociación falla cerrada; las demás operaciones no requieren esta consulta.

Crear índices nuevos sin eliminar colecciones ni resembrar la política. Los grants existentes y sus versiones se conservan. Las credenciales y URI son configuración privada del backend; nunca variables VITE ni logs.

## Garantías y reversión

La confirmación del módulo debe incluir auditoría durable sin muestreo. La entrega a Audit, su visor y retención integral no pertenecen a este cambio. Las revisiones se comprueban en el punto de escritura con coordinación real, no solo relectura previa. Esta garantía no declara implementados los escritores de Fleet/Invoices. Los roles Keycloak conservan su ventana JWT existente; no hay promesa de revocación instantánea externa.

Para volver a una versión anterior, deshabilitar rutas/UI de empresas y conservar Company, organizaciones, asociaciones y eventos. No borrar historial ni reactivar asociaciones revocadas. El servidor MongoDB puede permanecer en replica set para lectores anteriores. No revertir la infraestructura eliminando volúmenes. La guía no autoriza despliegues remotos.

## Evidencia del cambio

| Requisitos | Evidencia implementada | Verificación ejecutada |
| --- | --- | --- |
| Registro, validación, unicidad y metadatos | `backend/src/modules/organizations/domain/company.ts`, `backend/src/modules/organizations/infrastructure/mongodb/company-repository.ts` | `company-domain.test.ts`; `company-management.test.ts` (base aleatoria y replica set) |
| Contexto, roles, pertenencia y aislamiento | `backend/src/modules/organizations/application/companies.ts`, `backend/src/modules/organizations/infrastructure/mongodb/company-repository.ts` | `company-authorization.test.ts`; escenarios local/global y A frente a B de `company-management.test.ts` |
| Edición, estados, concurrencia y auditoría | `backend/src/modules/organizations/application/companies.ts`, transacción MongoDB y `company_management_events` | `company-management.test.ts`: commit/abort por fallo de auditoría, conflicto único, versiones y carrera ante política/asociación/estado |
| Administradores y proveedor de identidad | `backend/src/modules/identity/infrastructure/keycloak/administrator-directory.ts`; scope `company-directory-admin` y `kc-admin-api` de `keycloak/invoices-realm.json` | `company-directory.test.ts` (dobles HTTP para rol, usuario deshabilitado y proveedor caído); `company-management.test.ts` (asociación/revocación); `node scripts/test-company-directory-keycloak.mjs` (Keycloak 26.8.2 efímero) |
| REST, validación y OpenAPI | `backend/src/modules/organizations/presentation/companies.ts`, `backend/openapi/openapi.json` | `authorization-http.test.ts`; `npm --prefix backend run openapi:lint`; build de backend |
| Navegación, formularios, lista y asociaciones | `frontend/src/modules/company-management`; rutas protegidas en `frontend/src/app/app.tsx` | `company-api.test.ts`, `company-page.test.tsx` (validación/alta, estado, asociación y guard de contexto); `npm --prefix frontend run check`; build de frontend |
| Almacenamiento y compatibilidad | `backend/src/modules/organizations/infrastructure/mongodb/company-readiness.ts` | `node scripts/test-company-storage.mjs` (replica set y standalone temporales; commit, rollback, readiness y legados) |

Checks locales más recientes: backend 279 pruebas unitarias y arquitectura correctas; frontend 83 pruebas unitarias y arquitectura correctas, incluidas 12 de CompanyPage. Lint, TypeScript, OpenAPI y builds pasan. `company-management-responsive.spec.ts` pasó a 360 y 1280 px, incluida navegación con teclado, diálogo, validación y ausencia de overflow; las capturas se guardan en `.artifacts/company-management/`. `node scripts/test-company-integration.mjs` pasó 7/7 escenarios con MongoDB replica set real, incluyendo consultas/scope/índices, aislamiento, atomicidad y asociación idempotente concurrente. `node scripts/test-company-directory-keycloak.mjs` pasó 1/1 contra Keycloak 26.8.2 efímero: service account de solo lectura con scope/audiencia `kc-admin-api`, roles mínimos y usuario habilitado/inexistente. `node scripts/test-company-management.mjs` pasó el ciclo integrado de navegador con MongoDB y Keycloak reales, incluida la separación global/local, 403 después de desactivar A, invalidación del contexto, asociación/revocación, auditoría y presentación responsive.
