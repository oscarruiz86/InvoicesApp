# Inventario de rutas REST

Revisión estática de los Route Handlers actuales bajo `backend/src/app/api` frente a `backend/openapi/openapi.json`. Los segmentos dinámicos se representan entre llaves. Este inventario registra presencia método/ruta; no certifica por sí solo que cada schema, respuesta, permiso o ejemplo coincida con su implementación.

- Archivos Route Handler: **57**
- Métodos HTTP exportados: **73**
- Operaciones OpenAPI: **73**
- Implementadas sin operación documentada: **0**
- Documentadas sin handler: **0**

| Ruta | Métodos implementados | Todos documentados |
|---|---|---|
| `/api/assignments` | GET, POST | Sí |
| `/api/assignments/{id}/close` | POST | Sí |
| `/api/assignments/{id}` | GET | Sí |
| `/api/auth/me` | GET | Sí |
| `/api/auth/permissions` | GET | Sí |
| `/api/catalogs/{catalog}` | GET, POST | Sí |
| `/api/catalogs/{catalog}/{code}/deactivate` | POST | Sí |
| `/api/catalogs/{catalog}/{code}` | PATCH | Sí |
| `/api/companies` | GET, POST | Sí |
| `/api/companies/{id}/administrators` | GET, POST | Sí |
| `/api/companies/{id}/administrators/{associationId}/revoke` | POST | Sí |
| `/api/companies/{id}` | GET, PATCH | Sí |
| `/api/companies/{id}/status` | POST | Sí |
| `/api/docs` | GET | Sí |
| `/api/drivers` | GET | Sí |
| `/api/drivers/{id}` | GET | Sí |
| `/api/drivers/{id}/status` | PATCH | Sí |
| `/api/health` | GET | Sí |
| `/api/invitations/accept` | POST | Sí |
| `/api/invitations/preview` | POST | Sí |
| `/api/invitations/received` | GET | Sí |
| `/api/invitations/received/{id}/accept` | POST | Sí |
| `/api/invitations/received/{id}/reject` | POST | Sí |
| `/api/invitations/reject` | POST | Sí |
| `/api/invitations` | GET, POST | Sí |
| `/api/invitations/{id}/cancel` | POST | Sí |
| `/api/invitations/{id}/resend` | POST | Sí |
| `/api/invitations/{id}` | GET | Sí |
| `/api/invoice-sync/conflicts` | GET | Sí |
| `/api/invoice-sync/offline-credential` | POST | Sí |
| `/api/invoice-sync/submissions` | GET, POST | Sí |
| `/api/invoice-sync/submissions/{id}/image` | GET | Sí |
| `/api/invoice-sync/submissions/{id}/resolution` | POST | Sí |
| `/api/invoice-sync/submissions/{id}` | GET | Sí |
| `/api/invoices/qr/preview` | POST | Sí |
| `/api/invoices/qr` | POST | Sí |
| `/api/invoices` | GET, POST | Sí |
| `/api/invoices/{id}/image` | GET | Sí |
| `/api/invoices/{id}` | GET, PATCH | Sí |
| `/api/openapi` | GET | Sí |
| `/api/organization-contexts/resolve` | POST | Sí |
| `/api/organization-contexts` | GET | Sí |
| `/api/organization-memberships` | GET | Sí |
| `/api/organization-memberships/{id}/profile` | GET | Sí |
| `/api/organization-memberships/{id}/roles` | PATCH | Sí |
| `/api/organization-memberships/{id}/status` | PATCH | Sí |
| `/api/parameters` | GET | Sí |
| `/api/parameters/{key}/history` | GET | Sí |
| `/api/parameters/{key}` | GET, PATCH | Sí |
| `/api/roles` | GET, PUT | Sí |
| `/api/third-parties` | GET, POST | Sí |
| `/api/third-parties/{id}/relationships/{companyId}` | GET, PUT | Sí |
| `/api/third-parties/{id}` | GET, PATCH | Sí |
| `/api/third-parties/{id}/status` | POST | Sí |
| `/api/vehicles` | GET, POST | Sí |
| `/api/vehicles/{id}` | GET, PATCH | Sí |
| `/api/vehicles/{id}/status` | PATCH | Sí |

## Brechas de disponibilidad

No se encontró una operación OpenAPI adicional sin handler actual, ni un método implementado sin operación OpenAPI. Las specs archivadas (incluida `initial-invoices-app`) son evidencia de diseño y evolución; cualquier capacidad descrita allí sin handler en la rama actual no se considera una ruta disponible. Los workers, scripts de migración y adaptadores administrativos privados de Keycloak no son Route Handlers y quedan fuera del inventario HTTP.

La correspondencia de rutas no sustituye la auditoría de fidelidad de parámetros, cuerpos, respuestas, errores ni autorización de las tareas siguientes.
