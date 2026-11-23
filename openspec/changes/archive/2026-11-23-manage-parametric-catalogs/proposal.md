# Proposal

## Why

La aplicación guarda tipos documentales y ubicaciones en listas fijas o texto libre, lo que genera valores inconsistentes y dificulta validar, filtrar y evolucionar los datos. Como el sistema sigue en desarrollo y los registros actuales son de prueba, se adoptarán códigos estables y DIVIPOLA desde el inicio de su uso, retirando esos datos de prueba en lugar de migrarlos.

## What Changes

- Crear catálogos de tipos de documento, países, departamentos, municipios/ciudades y estados con códigos estables; permitir a APP_ADMIN consultar, editar etiquetas, crear tipos documentales y ubicaciones, y desactivarlas lógicamente cuando no tengan dependencias, usando `parameters:read/update`.
- Incorporar Colombia y sus divisiones territoriales usando códigos DIVIPOLA como identificadores oficiales; conservar los nombres y la jerarquía país-departamento-municipio.
- Eliminar los registros actuales de prueba de empresas y terceros del entorno de desarrollo antes de activar la escritura por códigos; no crear proceso de migración ni conciliación de esos registros.
- Usar los catálogos en formularios, filtros, validaciones y respuestas API de los módulos que actualmente usan estos campos.
- Mantener los códigos oficiales iniciales y su procedencia; permitir administrar tipos documentales y ubicaciones mediante altas validadas y bajas lógicas auditadas. Los estados y sus transiciones siguen controlados por cada entidad.
- Limitar cualquier eliminación de datos a registros de prueba en desarrollo; no eliminar ni modificar datos de producción.

## Capabilities

### New Capabilities
- `parametric-catalogs`: Administración, consulta y uso coherente de tipos documentales, geografía y etiquetas de estados, incluida la carga inicial de DIVIPOLA.

### Modified Capabilities
- `company-management`: Normalizar y usar las referencias de tipo documental y ubicación en empresas.
- `third-party-management`: Normalizar y usar las referencias de tipo documental y ubicación en terceros.
- `identity-access`: Obtener los tipos de documento del catálogo para el registro y perfil personal, preservando la validación de identidad.

## Impact

- Backend: nuevo módulo de catálogos, API protegida de lectura y administración, validación referencial, carga repetible de DIVIPOLA y limpieza acotada de datos sintéticos en desarrollo.
- Frontend: interfaz administrativa de parámetros y selectores dependientes; reemplazo de campos de texto de país/departamento/ciudad.
- MongoDB: nuevas colecciones y referencias/códigos normalizados en empresas y terceros; reinicio de registros de prueba en desarrollo antes del corte, sin migración de datos existentes.
- Keycloak: integración del tipo de documento del perfil con el catálogo y su sincronización/configuración, sin trasladar credenciales ni perfil de autenticación fuera de Keycloak.
- Datos: DIVIPOLA será la fuente de códigos territoriales colombianos; la carga inicial establece el catálogo para los nuevos registros.
