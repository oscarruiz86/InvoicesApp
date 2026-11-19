# Design

## Context

La página ya mantiene una pestaña de rol seleccionada y recibe una política versionada desde el API. El guardado se confirma actualmente con controles en línea, muestra texto durante el envío y presenta un aviso de éxito genérico. La aplicación ya usa MUI Dialog para confirmaciones y CircularProgress con texto accesible en las pantallas de sesión e inicio.

## Goals / Non-Goals

**Goals:**
- Usar patrones de diálogo, progreso y avisos ya conocidos por la aplicación.
- Comunicar la versión confirmada por el servidor y conservar el borrador ante errores.
- Preservar el rol seleccionado durante el ciclo de guardado.

**Non-Goals:**
- Cambiar permisos, catálogo, persistencia, auditoría o contrato HTTP.
- Enviar el borrador antes de confirmar o mostrar el cuerpo JSON crudo del servicio.
- Cambiar el rol seleccionado automáticamente como efecto del guardado.

## Decisions

### Confirmación con Dialog de MUI

El botón Guardar cambios abre un Dialog propio que indica que se reemplazará toda la matriz y muestra la versión vigente. Cancelar solo cierra el diálogo y conserva el borrador. Confirmar inicia el guardado. Durante la solicitud, el diálogo permanece abierto y bloquea cancelar, backdrop, Escape y un segundo envío para evitar una salida ambigua mientras el servidor procesa la actualización.

Se reutiliza MUI Dialog, ya presente en el producto, en lugar de window.confirm o una confirmación inline. Así se mantiene el foco dentro del diálogo y se puede presentar el estado de envío junto a la acción confirmada.

### Progreso basado en el patrón existente

Durante el guardado se muestra CircularProgress pequeño con texto visible y role=status, siguiendo el patrón de sesión e inicio. El indicador tiene etiqueta accesible y el botón de confirmación queda deshabilitado; no se agrega dependencia ni animación personalizada.

### Mostrar el resultado seguro del API

En éxito, la interfaz actualiza la política con el objeto devuelto por replace, cierra el modal y muestra un aviso que incluye la versión confirmada. No se sintetiza una versión a partir del borrador ni se imprime el JSON del servicio.

En error, la interfaz cierra el modal y presenta el mensaje seguro que ya traduce el transporte. Mantiene el borrador y, para conflictos o capacidad de auditoría agotada, conserva el requisito de recargar antes de volver a guardar.

### Mantener la pestaña activa

El rol activo se conserva como estado de interfaz independiente del objeto de política. Actualizar la política, completar una petición o mostrar un aviso no reinicia selectedRole. Si el catálogo recibido ya no contiene ese rol, se aplica el fallback existente al primer rol disponible.

Las pruebas cubren éxito, conflicto, capacidad de auditoría, cancelación y selección de rol para evitar que un cambio de estado del guardado reinicie la pestaña.

## Risks / Trade-offs

- Un diálogo bloqueado durante una solicitud larga puede parecer inmóvil. El indicador accesible y el texto de progreso hacen visible que la acción sigue en curso.
- La respuesta puede llegar después de una pérdida de contexto GLOBAL. El comportamiento de autorización vigente conserva prioridad y no debe exponer la política; solo se muestra el resultado si el contexto y los permisos continúan válidos.
- En 360 px el resumen, progreso y acciones deben apilarse sin desbordamiento; la prueba E2E valida ese ancho.

## Migration Plan

No hay migración de datos ni cambio de API. El cambio es de presentación y estado local. Se puede revertir restaurando el flujo anterior de confirmación sin tocar políticas guardadas.
