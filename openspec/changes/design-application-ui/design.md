## Context

`initialize-foundations` introdujo el tema global y el layout adaptable. El diseño amplía esa base con la opción A elegida por el usuario: un panel administrativo con navegación por módulos. [Shadcn Admin](https://github.com/satnaing/shadcn-admin#readme) aporta referencias para el menú lateral, el selector y las tablas. Los permisos y la selección del contexto se rigen por `implement-authorization` e `implement-organization-context`.

## Goals / Non-Goals

**Goals:** dejar un mapa navegable, una ficha por pantalla y wireframes anotados que permitan evaluar cobertura, consistencia y accesibilidad antes de implementar.
**Non-Goals:** código de producto, migración de librería visual, cambios en REST o Keycloak y definición de nuevas políticas de negocio.

## Decisions

### Navegación y sistema visual

- En escritorio, barra lateral plegable con Inicio, Administración, Flota, Facturas, Configuración y Auditoría. En móvil, la misma jerarquía en un menú superpuesto. Mostrar grupos y acciones según permisos y contexto confirmado.
- Encabezado con título, ruta de navegación cuando aporte orientación, organización activa y menú de sesión. Mostrar selector cuando el usuario pueda elegir. Al cambiar de contexto, mostrar carga y limpiar resultados anteriores. Si falla, explicar cómo recuperar un contexto autorizado.
- Inicio con accesos por rol y resumen basado en información disponible. Los indicadores concretos dependen de métricas y permisos aprobados.
- Definir colores semánticos, tipografía, espaciado, foco, componentes y estados con el tema global de Material UI. Usar tablas con búsqueda, filtros y paginación donde corresponda. En móvil, priorizar campos y acciones principales y llevar los datos secundarios al detalle. Usar páginas para formularios extensos y diálogos para confirmaciones breves.

### Inventario base

| Área | Pantallas y flujos a documentar | Referencia |
|---|---|---|
| Acceso e inicio | Entrada y retorno de Keycloak, error de autenticación, sesión expirada, cierre de sesión, inicio por rol, selección y cambio de contexto, contexto ausente o revocado, 403 y 404. | `implement-authentication`, `implement-authorization`, `implement-organization-context` |
| Empresas y terceros | Listados, detalle, alta, edición, cambio de estado y asociaciones de administradores donde proceda. Filtros y paginación para empresas, validación y duplicados. | `implement-company-management`, `organizations` |
| Usuarios y roles | Listado y detalle de usuarios, gestión de asociaciones, consulta de roles y permisos y asignación según facultades. Confirmar las operaciones de edición de roles con su especificación funcional. | `identity-access`, `implement-authorization` |
| Conductores y vehículos | Listados, detalle, alta, edición, activación y desactivación según las operaciones autorizadas. Mostrar estado y relaciones vigentes. | `fleet-management` |
| Asignaciones | Asignar conductor y vehículo, revisar vigencia e historial, cambiar tercero con confirmación y mostrar incompatibilidades o conflictos. | `fleet-management` |
| Facturas | Listado y filtros, detalle, registro manual, captura y revisión QR, confirmación y edición. Mostrar origen, asignación del vehículo, ventana de edición y campos QR protegidos. | `invoice-management`, `configuration` |
| Parámetros | Consulta de valores efectivos y edición autorizada, validación y tratamiento de configuración ausente. | `configuration` |
| Auditoría | Consulta autorizada de historial, filtros, detalle de evento y acceso desde el recurso cuando proceda. | `audit` |

### Revisión y entrega

Cada ficha identifica el propósito, el rol y permiso, el contexto, la entrada y salida, los campos, las acciones, las validaciones y los estados aplicables. La matriz vincula la ficha con los escenarios de OpenSpec. Los recorridos cubren `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER` con la matriz de permisos vigente. Usar 360 px y 1280 px como anchos de referencia y revisar foco, teclado, contraste, mensajes y recuperación.

## Risks / Trade-offs

- El menú completo puede crecer con los módulos. Agrupar por función y comprobar la navegación para un usuario con pocos permisos y otro con acceso amplio.
- Los módulos con decisiones abiertas pueden cambiar los campos y acciones visibles. Marcar esas decisiones en la ficha y enlazar la especificación responsable.
- La ventana de edición, el comportamiento de QR y el alcance de auditoría dependen de reglas funcionales. Los wireframes muestran cómo comunicar su resultado al usuario con datos ilustrativos.

## Entrega de diseño

- [Wireframes navegables](wireframes.html) con los modos por rol y catálogo a 360 px y 1280 px.
- [Guía de diseño](guia-de-diseno.md) con mapa, patrones, recorridos, decisiones pendientes y matriz de trazabilidad.

La revisión en navegador comprobó los 65 estados y pantallas en ambos anchos, la navegación de los cuatro roles y los recorridos de cambio de contexto, captura QR y conflicto de flota.
