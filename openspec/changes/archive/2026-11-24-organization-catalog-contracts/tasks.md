# Tasks

## 1. Desacoplar el manejador del repositorio MongoDB

- [x] 1.1 Definir `CatalogRepositoryPort` en application con los métodos usados por presentación y verificar mediante TypeScript que el adaptador MongoDB cumple el contrato.
- [x] 1.2 Tipar `catalogHandlers` contra el puerto y ejecutar `npm --prefix backend test -- tests/unit/parametric-catalogs.test.ts`; confirmar que rutas, permisos y respuestas no cambian.

## 2. Alinear cobertura de identificación NIT/CC

- [x] 2.1 Actualizar pruebas de dominio de empresa y tercero para cubrir NIT con dígito válido, CC sin dígito y combinaciones inválidas; ejecutar ambos archivos de prueba backend.
- [x] 2.2 Actualizar fixtures de las páginas de empresa y tercero para reflejar NIT con dígito verificador y comprobar el alta de empresa; ejecutar ambas pruebas de página frontend.

## 3. Documentación e integración

- [x] 3.1 Documentar el contrato interno y las reglas NIT/CC existentes en `docs/catalogs-and-organization-identification.md`; comprobar que README enlaza la guía.
- [ ] 3.2 Ejecutar `npm --prefix backend run check` y `npm --prefix frontend run check`; confirmar que la propuesta no modifica contratos HTTP ni persistencia.
