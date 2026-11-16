# Dependencias y reproducibilidad

La matriz exacta consultada antes de instalar está en `dependency-matrix.json`: versiones, motores y peer dependencies del registro oficial npm. Se seleccionó TypeScript 6.0.3, ya que typescript-eslint 8.72.1 admite versiones inferiores a 6.1 y la etiqueta latest de TypeScript apunta a 7. Las definiciones Node se fijaron a la línea 24.

Node 24.15.0 y npm 11.12.1 son el entorno observado. Cada aplicación utiliza versiones directas exactas, `engine-strict`, un lockfile separado y `npm ci` para reinstalar. No se utilizará `--legacy-peer-deps` para ocultar conflictos de compatibilidad.

`image-matrix.json` registra los digests inmutables consultados de Node 24.15.0 bookworm-slim, MongoDB 8.0 y Nginx stable-bookworm. MongoDB 8.x es compatible con Mongoose 9.x según la [tabla oficial](https://mongoosejs.com/docs/compatibility.html). Swagger UI 5.34.1 y Redocly CLI 2.76.0 se verificarán con el contrato OpenAPI 3.1 antes de aceptar su tarea.

El inventario de versiones no es evidencia de pruebas: sus resultados se documentan por separado durante la implementación. Las imágenes usarán sus digests y no una etiqueta mutable como único identificador.

La verificación del árbol transitivo de Next detectó que sus plugins import/react/jsx-a11y aún requieren ESLint 9. El backend fija ESLint 9.39.5, mientras el frontend conserva ESLint 10.14.0, compatible con sus plugins. Esta selección evita depender de overrides de peer dependencies.
# Autenticación

Se añaden `keycloak-js` 26.2.5 (frontend) y `jose` 6.2.16 (backend), con versiones exactas y lockfiles separados; instalación con engine-strict sobre Node 24.15.0. Keycloak 26.8.2 se fija por digest OCI en Compose y `image-matrix.json`.

Fuentes consultadas: [adaptador oficial](https://www.keycloak.org/securing-apps/javascript-adapter), [jose](https://github.com/panva/jose), [distribuciones Keycloak](https://www.keycloak.org/downloads). Las versiones npm y el digest se verificaron contra los registros oficiales durante la implementación. No se actualizaron otras dependencias para este incremento.
