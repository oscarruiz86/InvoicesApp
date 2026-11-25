# Tareas (Tasks)

## 1. Captura local de Keycloak y credenciales

- [x] 1.1 Habilitar los eventos administrativos del realm local con los detalles desactivados; verificar la representación del realm importado y la inicialización de una instancia desechable de Keycloak.
- [x] 1.2 Aprovisionar una cuenta de servicio local separada para el recolector desde un archivo secreto, con solo `realm-management:view-events`; verificar sus asignaciones de roles y que no pueda realizar escrituras en el realm.
- [x] 1.3 Añadir el perfil local opcional de Compose y la configuración del secreto para el recolector; verificar `docker compose config --quiet` y confirmar que el conjunto predeterminado de servicios no incluya el recolector.

## 2. Mapeo seguro de eventos de Keycloak

- [x] 2.1 Implementar el mapper de proveedor a Audit usando IDs estables del proveedor, marcas de tiempo, identidad verificada del actor y campos validados de acción/recurso; las pruebas unitarias verifican los valores permitidos y el rechazo de eventos malformados.
- [x] 2.2 Excluir representaciones, valores libres de detalles, identificadores de red, credenciales y tokens; las pruebas unitarias confirman que los campos sensibles del proveedor nunca aparezcan en los eventos mapeados.
- [x] 2.3 Documentar los límites de captura local, la privacidad de eventos, la configuración de la cuenta de servicio y la limitación de retención del proveedor; verificar que cada comando local documentado coincida con la configuración de Compose y del proceso de configuración.

## 3. Recolector de eventos recuperable

- [x] 3.1 Implementar un lector de páginas ascendentes y acotadas sobre un intervalo fijo, con un cursor Mongo durable y solapado; las pruebas unitarias verifican paginación, reintentos, solapamiento y que el cursor no avance si falla el destino.
- [x] 3.2 Añadir el comando local del worker con apagado ordenado y registros seguros del conteo de eventos; verificar que el worker solo se inicie desde el perfil opcional y no registre contenido de eventos ni credenciales.
- [x] 3.3 Probar la captura de eventos y el acceso `view-events` contra un realm desechable de Keycloak, incluidos reintento y reinicio de la entrega con identidad de evento estable; verificar que pase la suite de integración aislada.

## 4. Aceptación integrada

- [x] 4.1 Ejecutar las verificaciones del backend, la integración preparada de Keycloak/Mongo, la validación de Compose y la validación estricta de OpenSpec; confirmar que la configuración de producción no active la captura de eventos ni el recolector.
