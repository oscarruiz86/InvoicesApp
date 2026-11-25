# Ajustes de catálogos e identificación de organizaciones

Este documento registra cambios de soporte que quedaron fuera del commit de sincronización offline. Cubren la abstracción del repositorio de catálogos paramétricos y la consistencia de las pruebas de empresas y terceros con las reglas de identificación ya aplicadas por la aplicación.

## Repositorio de catálogos paramétricos

El manejador HTTP de catálogos depende de `CatalogRepositoryPort`, definido en `backend/src/modules/parametric-catalogs/application/catalog-repository.ts`, en vez de inferir su tipo desde la fábrica concreta de MongoDB.

El contrato agrupa las operaciones que usa la capa de presentación:

- listar entradas, con un código padre opcional;
- actualizar la etiqueta con control de versión y actor;
- crear una entrada;
- desactivar una entrada con control de versión.

El adaptador MongoDB existente sigue siendo el proveedor usado por la aplicación. Este cambio desacopla presentación e infraestructura y permite proporcionar implementaciones alternativas o dobles de prueba sin cambiar el comportamiento de la API.

## Identificación de empresas y terceros

Los perfiles de empresa y tercero admiten documentos `NIT` y `CC` con estas reglas:

- Para un `NIT`, el dígito de verificación es obligatorio en altas y actualizaciones nuevas y debe contener un solo dígito decimal. La compatibilidad con registros legados sin ese dato se mantiene mediante la ruta de lectura histórica.
- Para una `CC`, el dígito de verificación debe quedar vacío y se normaliza a `null`.
- Los formularios limpian el dígito de verificación al cambiar el tipo de documento de `NIT` a `CC`.

Las pruebas de dominio reflejan ambas variantes. Las pruebas de páginas usan un NIT con dígito de verificación y lo ingresan al crear una empresa; las pruebas de tercero usan el mismo formato de perfil.

## Archivos documentados

| Archivo | Ajuste |
| --- | --- |
| `backend/src/modules/parametric-catalogs/application/catalog-repository.ts` | Define el puerto del repositorio. |
| `backend/src/modules/parametric-catalogs/presentation/catalogs.ts` | Inyecta el puerto en los manejadores. |
| `backend/tests/unit/company-domain.test.ts` | Alinea el perfil NIT con el dígito requerido y cubre CC sin dígito. |
| `backend/tests/unit/third-party-domain.test.ts` | Añade los mismos casos para terceros y mantiene un tipo documental inválido en los rechazos. |
| `frontend/tests/unit/company-page.test.tsx` | Usa un perfil NIT válido e ingresa el dígito al probar el alta. |
| `frontend/tests/unit/third-party-page.test.tsx` | Usa un perfil NIT válido en los escenarios de interfaz. |

Los cambios descritos aquí no alteran las reglas de negocio offline ni la API de facturas. No cambian los contratos HTTP ni la persistencia.

## Comandos de verificación

```powershell
npm --prefix backend test -- tests/unit/parametric-catalogs.test.ts tests/unit/company-domain.test.ts tests/unit/third-party-domain.test.ts
npm --prefix frontend test -- tests/unit/company-page.test.tsx tests/unit/third-party-page.test.tsx
```

## Resultados registrados

- Backend, pruebas focalizadas: catálogos 2/2 y dominios de empresa/tercero 33/33.
- Frontend, pruebas focalizadas de páginas: 17/17.
- `npm --prefix backend run check`: completó; 63 archivos, 552 pruebas pasaron, una omitida y arquitectura válida. ESLint reportó advertencias sin errores.
- `npm --prefix frontend run check`: ESLint (13 advertencias, sin errores) y TypeScript terminaron correctamente. La suite completa quedó inconclusa tras varios minutos sin salida; al interrumpirla apareció `Not implemented: navigation to another Document`. Por eso no se considera aprobado el chequeo integral de frontend, aunque las dos pruebas de páginas afectadas sí pasaron.
