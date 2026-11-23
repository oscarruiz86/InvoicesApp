# Tasks

## 1. Catálogos y contratos de backend

- [x] 1.1 Definir modelo versionado de catálogos, códigos, etiquetas, vigencia y auditoría; verificar unicidad de códigos y referencias mediante pruebas de dominio y repositorio.
- [x] 1.2 Implementar semillas repetibles para documentos personales, NIT, países ISO, estados existentes por entidad y geografía DIVIPOLA; verificar conteos, jerarquía y segunda ejecución sin duplicados.
- [x] 1.3 Publicar API autenticada de consulta y edición de etiquetas usando `parameters:read/update`, control de versiones y auditoría; proteger operaciones no permitidas y documentar contratos HTTP/OpenAPI.
- [x] 1.4 Permitir crear tipos documentales y elementos geográficos y desactivarlos lógicamente con validación de jerarquía, dependencias, permisos y auditoría; conservar estados de negocio y NIT protegidos.

## 2. Catálogos base y reinicio de pruebas

- [x] 2.1 Implementar carga repetible del archivo vigente DANE con fuente, fecha y hash de versión, códigos como texto y relaciones padre-hijo; verificar filas inválidas, jerarquía y segunda ejecución sin duplicados.
- [x] 2.2 Implementar limpieza de datos sintéticos de empresas, terceros y dependencias de prueba solo en desarrollo, con validación cerrada de entorno/destino y vista previa de conteos; verificar que producción y destinos desconocidos aborten sin borrar.
- [x] 2.3 Documentar la inicialización de catálogos y el reinicio de fixtures de desarrollo; verificar que las instrucciones indiquen prerrequisitos, conteos afectados y exclusión de producción.

## 3. Administración e interfaces de selección

- [x] 3.1 Ampliar el módulo de parámetros para consultar, buscar, ordenar, paginar y editar catálogos; permitir alta y desactivación lógica seguras según catálogo, con controles responsive y permisos.
- [x] 3.2 Crear selectores en cascada país→departamento→municipio y tipo documental desde la API de catálogos; verificar filtrado por cada padre, limpieza de valores descendientes al cambiarlo, estados de carga/error y uso de códigos al guardar.

## 4. Integración con módulos existentes

- [x] 4.1 Cambiar contratos, modelos y formularios de empresas/terceros a códigos de documento y ubicación y actualizar filtros/listados; verificar alta, edición, detalle y filtros por código conservando aislamiento y versionado.
- [x] 4.2 Sincronizar tipos documentales disponibles en configuración de Keycloak y validar perfiles leídos contra catálogo; verificar registro, lectura de perfiles existentes y manejo seguro de códigos inactivos.
- [x] 4.3 Presentar etiquetas de estado centralizadas en entidades dentro del alcance sin cambiar códigos, disponibilidad o transiciones de dominio; verificar que los estados de entidad sigan siendo los propios de cada módulo.
- [x] 4.4 Actualizar documentación de API, administración y preparación de datos; verificar ejemplos de códigos/etiquetas y esquema OpenAPI coherentes.

## 5. Verificación de integración

- [x] 5.1 Ejecutar validación OpenSpec estricta y verificaciones de backend/frontend pertinentes; corregir hallazgos y confirmar la carga inicial, integridad referencial, permisos, limpieza solo en desarrollo y regresión de flujos de empresas, terceros e identidad.
- [x] 5.2 Corregir validaciones NIT/CC en formularios y servicios, y validar tipos en backend y frontend.
