# Spec Delta

## ADDED Requirements

### Requirement: Confirmación y resultado del guardado de la matriz

El guardado de la matriz MUST guiar al administrador con una confirmación propia, un estado de progreso accesible y la respuesta segura del servicio. Completar la solicitud MUST conservar el rol seleccionado si permanece en el catálogo.

#### Scenario: Confirmación en modal
- **WHEN** un APP_ADMIN con cambios selecciona Guardar cambios
- **THEN** la aplicación abre un modal que resume el reemplazo y la versión vigente; cancelar conserva el borrador y no envía la solicitud

#### Scenario: Envío confirmado y en curso
- **WHEN** el administrador confirma el modal
- **THEN** la solicitud se envía una sola vez, el modal muestra progreso accesible acorde con los patrones existentes y sus acciones quedan bloqueadas durante el envío

#### Scenario: Respuesta exitosa del servicio
- **WHEN** el servicio confirma la actualización y devuelve la nueva versión
- **THEN** la interfaz muestra el resultado confirmado y esa versión, cierra el modal y conserva seleccionada la pestaña del rol activa

#### Scenario: Respuesta de error del servicio
- **WHEN** el servicio devuelve un conflicto u otro error recuperable, incluida la capacidad de auditoría agotada
- **THEN** la interfaz comunica el error seguro, conserva el borrador y la pestaña activa, y ofrece recarga cuando la respuesta la requiera

#### Scenario: Finalización después de cambiar de pestaña
- **WHEN** el administrador cambia la pestaña del rol mientras revisa el borrador y luego termina el guardado
- **THEN** la respuesta del servicio no cambia la pestaña activa si ese rol continúa en el catálogo
