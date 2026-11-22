# Aceptación cruzada de contexto organizacional

## Caso 19: límites de ámbito reales

La integración `invoice-repository.test.ts` persiste recursos en MongoDB aislado. Al guardar una factura para el tercero A, buscar el mismo ID bajo B o bajo otro `ownerSubject` devuelve `null`; listar y contar bajo B o con un subject diferente devuelve cero, mientras que el DRIVER dueño recibe su único resultado. El test comprueba que el evento de la factura permanece único.

Fleet aporta evidencia complementaria en `assignment-repository.test.ts`: crear una asignación de A con vehículo/conductor de B falla como recurso inexistente y no escribe asignación ni auditoría. Las consultas de asignaciones, vehículos y conductores filtran por tercero, y las lecturas DRIVER de asignación requieren la combinación exacta de subject, tercero, asignación y vehículo.

## Revocación concurrente antes de confirmar

En `invoice-repository.test.ts`, el caso “rejects QR creation when the driver membership is revoked after parsing but before transaction confirmation” pausa la solicitud tras leer la asignación. Mientras espera, desactiva en MongoDB la membership e incrementa su revisión. Al continuar, la autoridad organizacional confirma dentro de la transacción y rechaza con `FORBIDDEN`; no quedan factura ni evento de facturación.

## Evidencia de ejecución

`npm --prefix backend run test:integration:prepared` ejecutó las 17 suites de integración con MongoDB y Keycloak desechables: 75/75 pruebas aprobadas. La suite incluye los dos casos de factura descritos y las verificaciones de aislamiento Fleet/Organizations. Los fixtures se eliminan al terminar.

El cambio no añade CRUD ni permisos. La entrega de auditoría transversal y la política de retención permanecen a cargo de las propuestas propietarias de Audit.
