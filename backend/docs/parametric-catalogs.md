# Catálogos paramétricos

## Carga inicial

Desde `backend`, configura `.env.local` con la conexión de desarrollo y ejecuta:

```powershell
npm run parametric-catalogs:init
```

El inicializador lee `src/modules/parametric-catalogs/data/divipola-20261123.csv`, conserva los códigos como texto y registra la versión, el origen y el hash SHA-256. Incluye tipos documentales, país Colombia, departamentos y municipios, islas y áreas no municipalizadas. La carga es repetible y no elimina ni convierte datos de empresas o terceros.

## Vista previa y reinicio de datos sintéticos

El reinicio está limitado a `NODE_ENV=development`, a MongoDB local y a la base `invoices_app` o una base cuyo nombre termine en `_test`. La primera ejecución siempre presenta conteos sin cambiar datos:

```powershell
npm run parametric-catalogs:reset-dev
```

Para confirmar el borrado, define `PARAMETRIC_CATALOGS_RESET_DATABASE` con el nombre exacto de la base que apareció en la vista previa y agrega `-- --apply`:

```powershell
$env:PARAMETRIC_CATALOGS_RESET_DATABASE = 'invoices_app'
npm run parametric-catalogs:reset-dev -- --apply
Remove-Item Env:PARAMETRIC_CATALOGS_RESET_DATABASE
```

La operación elimina empresas y terceros de prueba, organizaciones de esos tipos y sus membresías, asociaciones, relaciones, invitaciones y eventos dependientes. No elimina usuarios/identidades ni catálogos. El script aborta para producción, hosts externos, bases fuera de la lista permitida o si falta la confirmación exacta de la base.

## Administración

La API y la pantalla Catálogos paramétricos requieren `parameters:read`; editar etiquetas, crear tipos documentales/ubicaciones y desactivarlos requiere `parameters:update`. Los códigos iniciales DIVIPOLA proceden de la carga versionada. Las altas validan códigos y padres; las bajas son lógicas (`active=false`) y se rechazan cuando hay registros asociados o elementos hijos. No se permite desactivar NIT ni crear/desactivar estados de negocio. Los formularios guardan códigos DIVIPOLA y muestran opciones en cascada: país, departamento y municipio.

La sincronización de opciones del perfil documental de Keycloak conserva los códigos personales CC, CE, TI, RC, PA y PPT. NIT se mantiene para documentos tributarios de empresas y terceros.
