# Spec Delta

## ADDED Requirements

### Requirement: Operación reproducible del almacenamiento local de imágenes

El modo host y Compose MUST configurar el proveedor local con raíz absoluta privada y namespace técnico explícito. La documentación MUST indicar permisos mínimos, capacidad, verificación de escritura, respaldo coordinado con MongoDB y recuperación. La raíz MUST permanecer fuera de directorios públicos y del control de versiones.

#### Scenario: Ejecución en host
- **WHEN** el backend se ejecuta en el host con las variables documentadas
- **THEN** almacena imágenes bajo una raíz privada absoluta ignorada por Git y conserva la jerarquía canónica

#### Scenario: Respaldo y recuperación
- **WHEN** un operador sigue el procedimiento documentado de respaldo o restauración
- **THEN** captura MongoDB y la raíz de imágenes como un conjunto coordinado y puede verificar su correspondencia antes de habilitar escrituras

## MODIFIED Requirements

### Requirement: Datos locales persistentes y puertos limitados

MongoDB y el almacenamiento local de imágenes MUST usar volúmenes persistentes de desarrollo separados. Los puertos publicados MUST limitarse a loopback por defecto y el volumen de imágenes MUST ser accesible solo por el backend. La parada normal MUST preservar ambos conjuntos de datos y no eliminar volúmenes.

#### Scenario: Reinicio del entorno
- **WHEN** se detienen y vuelven a iniciar los servicios sin solicitar borrado de volúmenes
- **THEN** se conservan MongoDB y las imágenes locales, y los puertos siguen publicados solo en las interfaces locales configuradas

#### Scenario: Aislamiento del volumen de imágenes
- **WHEN** se inspeccionan montajes y servicios del Compose de desarrollo
- **THEN** únicamente el backend tiene montada la raíz de imágenes y esta no se sirve como volumen o ruta pública del frontend

### Requirement: Ejemplos de entorno y documentación operativa

El proyecto MUST incluir ejemplos sin secretos y README con requisitos, instalación, variables públicas/privadas, ejecución host/Compose, URLs, validación, parada y alcance. MUST documentar OIDC y el proveedor de imágenes, incluyendo obligatoriedad, valores por modo, rutas privadas, persistencia y recuperación, y aclarar que health no acredita datos, identidad ni disponibilidad del storage.

#### Scenario: Ejecución siguiendo README
- **WHEN** se siguen las instrucciones en un entorno limpio con prerrequisitos y valores locales propios
- **THEN** se puede configurar identidad y almacenamiento, arrancar y validar una carga y descarga privada sin adivinar variables, destinos ni permisos
- **AND** cambiar origen, puerto o raíz requiere actualizar explícitamente la configuración correspondiente

#### Scenario: Revisión de ejemplos y exportaciones
- **WHEN** se inspeccionan archivos versionables y configuración exportada
- **THEN** no contienen passwords, tokens, usuarios reales, secretos, claves privadas ni imágenes de factura
- **AND** se documenta cómo suministrar credenciales y rutas locales mediante entorno ignorado
