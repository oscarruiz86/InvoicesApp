# Proposal

## Why

El formulario de facturas ya transmite y valida la imagen, pero el backend la conserva como binario dentro de MongoDB, acoplando el agregado de factura al mecanismo de archivos y dificultando operar el almacenamiento local o sustituirlo por otro proveedor. Se necesita una abstracción seleccionada exclusivamente por configuración, con almacenamiento local durable como primera implementación y sin debilitar la privacidad, los límites ni la consistencia actuales.

## What Changes

- Extraer la escritura, lectura, reemplazo y eliminación compensatoria de imágenes a un puerto de almacenamiento de objetos independiente del repositorio MongoDB de facturas.
- Seleccionar un único proveedor mediante `INVOICE_IMAGE_STORAGE_PROVIDER`; el primer proveedor soportado será `local`, configurado con una raíz privada absoluta mediante `INVOICE_IMAGE_STORAGE_LOCAL_ROOT`. Un valor ausente, desconocido o incompleto impedirá operar las rutas privadas de facturas con un error de configuración neutro.
- Persistir cada imagen local bajo una clave canónica basada únicamente en identificadores internos y extensión derivada del contenido validado: `<empresa>/<tercero>/<vehiculo>/<factura>/imagen.<ext>`.
- Definir `empresa` como un namespace técnico estable configurado por `INVOICE_IMAGE_STORAGE_COMPANY_ID`, porque el agregado y el contexto actuales de Invoice solo contienen `thirdPartyId` y un tercero puede relacionarse con varias empresas. Este segmento no concede autorización ni introduce una asociación de negocio nueva.
- Mantener las reglas actuales: una sola imagen JPEG o PNG, máximo 5 MiB después de normalización, límite de píxeles, lectura solo por el endpoint autenticado y sin rutas públicas ni URLs remotas.
- Guardar en MongoDB únicamente referencia, proveedor y metadatos verificables del objeto; no almacenar nuevos binarios. La creación y el reemplazo usarán compensación explícita para evitar tanto referencias rotas como archivos huérfanos cuando MongoDB o la auditoría fallen.
- Adoptar directamente el nuevo esquema de referencias externas. Los datos actuales de facturas e imágenes son descartables por encontrarse el producto en desarrollo; no se implementará migración, lectura legada ni fallback a binarios de MongoDB.
- Montar una ubicación/volumen persistente para el proveedor local en desarrollo y documentar variables, permisos, respaldo y recuperación.
- Mantener sin cambios el contrato HTTP del formulario y de `GET /api/invoices/{id}/image`; la selección del proveedor será exclusivamente de servidor.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `invoice-management`: los adjuntos privados pasan a un almacenamiento configurable, con clave jerárquica, metadatos en MongoDB y compensación ante fallos.
- `backend-runtime`: la configuración del proveedor y de la raíz local se valida sin exponer valores y sin convertir el build en una operación de E/S.
- `local-development`: el entorno local/Compose incorpora almacenamiento persistente privado para imágenes y documentación operativa reproducible.

## Impact

- Backend: puertos de Invoice, caso de uso, repositorio MongoDB, nuevo adaptador local, composición de `invoice-endpoint`, validación de entorno y pruebas.
- Datos: los documentos de imagen se crearán únicamente como referencia de objeto y metadatos. Las facturas e imágenes actuales de desarrollo podrán eliminarse y recrearse; no habrá compatibilidad con el esquema binario anterior.
- Operación: nuevas variables privadas y un directorio o volumen con permisos mínimos, respaldo coordinado con MongoDB y capacidad suficiente.
- API/frontend: no se modifica el multipart, los límites públicos, `imageUrl` ni el endpoint privado de descarga.
- Dependencias: la implementación local usará primitivas nativas de Node.js; esta propuesta no incorpora SDK de nube ni implementa un segundo proveedor.
