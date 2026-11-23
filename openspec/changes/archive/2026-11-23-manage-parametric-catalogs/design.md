# Design

## Context

Las empresas y terceros guardan país, departamento y ciudad como texto; los filtros comparan esos textos. Los tipos de documento personales se validan con una constante de seis códigos y las empresas/terceros usan NIT fijo. Ya existe un módulo de parámetros y permisos globales `parameters:read/update/create/deactivate`, que puede alojar la administración de catálogos sin crear un segundo patrón de autorización.

## Goals / Non-Goals

**Goals:**
- Catálogos únicos y referenciables por código, con etiquetas y estado de disponibilidad.
- Geografía colombiana disponible desde la carga inicial, con códigos y jerarquía oficial DIVIPOLA.
- Empezar a crear empresas y terceros con referencias geográficas desde que se habilite el nuevo flujo.
- Mantener la identidad personal en Keycloak y las reglas de estado en cada entidad.

**Non-Goals:**
- Definir nuevos tipos de documento tributarios o alterar cálculo/validación de NIT.
- Permitir que usuarios creen estados de negocio o transiciones entre estados.
- Geocodificar direcciones o inferir municipio a partir de dirección libre.
- Administrar centros poblados DIVIPOLA en el primer corte; el alcance geográfico de uso será país, departamento y municipio/distrito.

## Decisions

1. **Catálogos con código estable separado de la etiqueta.** Guardar el código como referencia en datos funcionales y resolver la etiqueta para presentación. Las etiquetas podrán cambiar sin reescribir registros. Se considera texto normalizado como alternativa, pero no resuelve homónimos, cambios de nombre ni consistencia de filtros.

2. **Fuentes de geografía diferenciadas.** Usar ISO 3166-1 para identificar países y DIVIPOLA-DANE para la jerarquía territorial colombiana. Importar el listado vigente publicado por DANE y guardar fuente, fecha de consulta y versión/hash de cada carga; no depender de una consulta en línea durante las operaciones normales. DANE mantiene la codificación y ofrece consulta/descarga en [DIVIPOLA](https://www.dane.gov.co/index.php/sistema-estadistico-nacional-sen/normas-y-estandares/nomenclaturas-y-clasificaciones/nomenclaturas/codificacion-de-la-division-politica-administrativa-de-colombia-divipola).

3. **Vigencia de códigos territoriales.** No reutilizar códigos retirados ni borrar elementos referenciados. Una actualización de la fuente marca elementos no vigentes para nuevas selecciones y preserva su identidad. Los cambios de código se registran como equivalencias verificadas, nunca mediante reemplazo automático de claves.

4. **Tipos de documento como catálogo de identidad, NIT como regla tributaria.** Mantener CC, CE, TI, RC, PA y PPT como tipos personales iniciales. El catálogo controla opciones/etiquetas; las reglas de NIT para empresas y terceros se conservan en sus módulos. Para Keycloak, publicar/sincronizar opciones desde los datos versionados de catálogo al inicializar configuración, sin llamadas remotas al proveedor por cada lectura del perfil.

5. **Permisos limitados a los grants actuales.** Reutilizar `parameters:read` para consultar y `parameters:update` para editar etiquetas, crear tipos documentales/ubicaciones y desactivarlos lógicamente cuando no tengan referencias dependientes. No conceder permisos nuevos. Los estados solo permiten editar etiquetas y cada entidad conserva sus transiciones. NIT no se puede desactivar.

6. **Administración segura de elementos.** Las altas validan formato de código y jerarquía padre-hijo. Las bajas marcan `active=false`, incrementan versión y registran auditoría; se rechazan si existen elementos hijos o referencias de empresas/terceros. No hay borrado físico.

7. **Reinicio de datos sintéticos en desarrollo.** Antes de habilitar las nuevas referencias, limpiar los registros de prueba actuales de empresas y terceros y sus dependencias organizacionales en la base de desarrollo. El procedimiento debe comprobar entorno y destino de base de datos, presentar conteos y fallar cerrado si el entorno no es desarrollo. Se descarta una migración por registro porque los datos son de prueba; se excluye explícitamente producción.

## Risks / Trade-offs

- [Una limpieza de prueba puede apuntar por error a una base incorrecta] → Verificar entorno y URI/base destino, mostrar conteos, limitar el proceso a desarrollo y abortar ante cualquier incongruencia.
- [Los cambios de DIVIPOLA pueden afectar municipios o nombres] → Importar como versiones, conservar códigos retirados para historial y exigir revisión de equivalencias.
- [Una etiqueta editable podría confundir a usuarios o afectar integraciones] → Exponer y filtrar por códigos; dejar las etiquetas como presentación y auditar cambios.
- [El formulario de Keycloak no consulta la API del catálogo en tiempo real] → Sincronizar las opciones versionadas durante la preparación del realm y verificar su correspondencia en arranque/operación.
- [Cambiar a referencias modifica contratos API y búsquedas] → Desplegar backend, frontend y datos iniciales coordinadamente en desarrollo antes de aceptar nuevos registros.

## Initial Setup Plan

1. Cargar catálogos base de documentos y estados y poblar país y DIVIPOLA desde fuentes versionadas.
2. Ejecutar en desarrollo el procedimiento de limpieza de datos sintéticos, verificando el destino y revisando conteos antes de borrar empresas, terceros y dependencias de prueba.
3. Desplegar contratos de backend, formularios y filtros que escriben/consultan códigos; verificar jerarquía territorial y ausencia de escrituras con nombres como claves.
4. Crear registros de prueba nuevos y comprobar que las ubicaciones se relacionen con los códigos de catálogo correctos.

No se realiza backfill ni se conserva compatibilidad con los campos textuales de esos registros de prueba. Si la validación falla antes de habilitar escrituras, se revierte el despliegue de código; no se restaura la base limpiada como datos funcionales, pues eran fixtures de desarrollo reemplazables. Esta limpieza no se ejecuta en producción.
