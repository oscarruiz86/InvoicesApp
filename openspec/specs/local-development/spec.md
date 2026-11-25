# local-development Specification

## Purpose

Permitir instalar, ejecutar y verificar las dos aplicaciones localmente de forma reproducible, con comunicación correcta entre navegador y contenedores y límites arquitectónicos comprobables.

## Requirements

### Requirement: Instalación y compilación independientes
Frontend y backend MUST mantener manifiestos, lockfiles, scripts, pruebas e imágenes independientes. Cada aplicación MUST poder instalarse y compilarse sin importar código interno ni requerir el build de la otra.

#### Scenario: Compilación aislada de cada aplicación
- **WHEN** se instalan dependencias y se ejecuta el build de una aplicación sin compilar la otra
- **THEN** produce su salida correspondiente sin imports cruzados ni configuración de paquetes compartida obligatoria

### Requirement: Arquitectura comprobable antes de capacidades funcionales
Ambas aplicaciones MUST organizar módulos con límites Domain, Application, Infrastructure y Presentation y comprobar dependencias hacia dentro y ausencia de ciclos. MUST aplicar SOLID y reservar contextos de negocio sin crear implementaciones o patrones DDD artificiales.

#### Scenario: Dependencia prohibida detectada
- **WHEN** se verifica un ejemplo que importa un framework o capa externa desde Domain o un adaptador concreto desde Application
- **THEN** la comprobación arquitectónica falla en la aplicación correspondiente

#### Scenario: Revisión de módulos reservados
- **WHEN** se revisan los límites iniciales de los seis contextos
- **THEN** se documenta su propiedad sin crear entidades, repositorios, modelos o endpoints de negocio ficticios

### Requirement: Entorno Docker reproducible de desarrollo
El proyecto MUST proporcionar Dockerfiles por aplicación y Compose de desarrollo con frontend, backend, MongoDB y Keycloak, red compartida, versiones fijadas y recarga de código. Las dependencias del contenedor MUST permanecer separadas de las del host. Keycloak MUST disponer de configuración reproducible de realm/cliente sin usuarios, credenciales ni claves privadas versionadas.

#### Scenario: Arranque completo local
- **WHEN** se prepara el entorno siguiendo la documentación, se suministran credenciales locales fuera del repositorio y se ejecuta Compose con puertos disponibles
- **THEN** los servicios arrancan, el navegador puede consultar la API y realizar login mediante Keycloak

#### Scenario: Cambio de código en desarrollo
- **WHEN** se modifica código de la aplicación montada en el contenedor de desarrollo
- **THEN** la aplicación refleja el cambio mediante su recarga de desarrollo sin reinstalar dependencias del host

#### Scenario: Reinicio de Keycloak
- **WHEN** se reinicia el entorno sin eliminar volúmenes
- **THEN** se conservan los usuarios y configuración locales y la importación inicial no se presenta como una sobrescritura automática del realm existente

### Requirement: Direccionamiento correcto entre navegador y servicios
La configuración local MUST distinguir destinos públicos y nombres Docker. Las llamadas `/api` MUST alcanzar el backend en host y Compose. El issuer público MUST coincidir exactamente con `iss` en ambos modos; la descarga interna de JWKS MUST NOT cambiar el issuer esperado ni exponer nombres internos al navegador.

#### Scenario: Consulta por proxy en Compose
- **WHEN** el navegador consulta `/api/health` desde el origen frontend en Compose
- **THEN** el servidor frontend reenvía al backend por nombre de servicio preservando `/api/health`
- **AND** el navegador no intenta resolver nombres internos Docker

#### Scenario: Aplicaciones ejecutadas en el host
- **WHEN** frontend y backend se ejecutan con scripts locales y configuración documentada
- **THEN** la base pública `/api` llega al backend mediante el proxy del host

#### Scenario: Validación desde contenedor
- **WHEN** el navegador recibe un token con issuer `http://localhost:8080/realms/invoices` y llama a la API en Compose
- **THEN** el backend exige ese issuer y puede obtener claves desde el endpoint interno configurado de Keycloak
- **AND** no intenta contactar al localhost del propio contenedor para descargar claves

### Requirement: Datos locales persistentes y puertos limitados
MongoDB y el almacenamiento local de imágenes MUST usar volúmenes persistentes de desarrollo separados. Los puertos publicados MUST limitarse a loopback por defecto y el volumen de imágenes MUST ser accesible solo por el backend. La parada normal MUST preservar ambos conjuntos de datos y no eliminar volúmenes.

#### Scenario: Reinicio del entorno
- **WHEN** se detienen y vuelven a iniciar los servicios sin solicitar borrado de volúmenes
- **THEN** se conservan MongoDB y las imágenes locales, y los puertos siguen publicados solo en las interfaces locales configuradas

#### Scenario: Aislamiento del volumen de imágenes
- **WHEN** se inspeccionan montajes y servicios del Compose de desarrollo
- **THEN** únicamente el backend tiene montada la raíz de imágenes y esta no se sirve como volumen o ruta pública del frontend

### Requirement: Operación reproducible del almacenamiento local de imágenes

El modo host y Compose MUST configurar el proveedor local con raíz absoluta privada y namespace técnico explícito. La documentación MUST indicar permisos mínimos, capacidad, verificación de escritura, respaldo coordinado con MongoDB y recuperación. La raíz MUST permanecer fuera de directorios públicos y del control de versiones.

#### Scenario: Ejecución en host
- **WHEN** el backend se ejecuta en el host con las variables documentadas
- **THEN** almacena imágenes bajo una raíz privada absoluta ignorada por Git y conserva la jerarquía canónica

#### Scenario: Respaldo y recuperación
- **WHEN** un operador sigue el procedimiento documentado de respaldo o restauración
- **THEN** captura MongoDB y la raíz de imágenes como un conjunto coordinado y puede verificar su correspondencia antes de habilitar escrituras

### Requirement: Ejemplos de entorno y documentación operativa
El proyecto MUST incluir ejemplos sin secretos y README con requisitos, instalación, variables públicas/privadas, ejecución host/Compose, URLs, validación, parada y alcance. MUST explicar configuración OIDC, audiencia, roles, renovación, logout, pruebas Swagger y que health no acredita disponibilidad de datos, identidad ni storage. MUST documentar el proveedor de imágenes, su obligatoriedad, valores por modo, rutas privadas, persistencia y recuperación.

#### Scenario: Ejecución siguiendo README
- **WHEN** se siguen las instrucciones en un entorno limpio con prerrequisitos y valores locales propios
- **THEN** se puede instalar, configurar realm/cliente, crear un usuario local, configurar almacenamiento, arrancar y validar una carga y descarga privada sin adivinar variables, destinos ni permisos
- **AND** cambiar origen o puerto requiere actualizar las URIs y Web Origins explícitos correspondientes
- **AND** cambiar la raíz requiere actualizar explícitamente la configuración correspondiente

#### Scenario: Revisión de ejemplos y exportaciones
- **WHEN** se inspeccionan archivos versionables y configuración exportada del realm
- **THEN** no contienen passwords, tokens, usuarios reales, secretos de cliente, claves privadas ni imágenes de factura
- **AND** se documenta cómo suministrar credenciales de bootstrap y pruebas mediante entorno local ignorado
- **AND** las rutas locales se suministran mediante entorno ignorado

### Requirement: Validaciones reproducibles y separadas
Cada aplicación MUST ofrecer tipos, lint, pruebas unitarias y arquitectura sin servicios externos. MUST existir verificación separada de MongoDB, JWT/JWKS, HTTP/OpenAPI y navegador con Keycloak real, usando datos y credenciales de prueba aislados de desarrollo. Builds MUST funcionar sin conexiones externas ni credenciales reales.

#### Scenario: Comprobación sin servicios externos
- **WHEN** se ejecuta calidad o build sin MongoDB ni Keycloak activos
- **THEN** las comprobaciones deterministas usan puertos y claves de prueba sin conectarse a esos servicios

#### Scenario: Pruebas integradas explícitas
- **WHEN** se ejecutan verificaciones de integración, HTTP y navegador con servicios preparados
- **THEN** se comprueban conexión reutilizable, contratos REST, Swagger, layout responsive, proxy y flujo OIDC completo
- **AND** MongoDB utiliza una base de pruebas separada y las pruebas Keycloak usan un realm de prueba aislado con usuarios efímeros

### Requirement: Aprobación previa y ausencia de despliegue
`implement-authentication` MUST permanecer en planificación hasta aprobación explícita. Su aprobación MUST limitarse a autenticación, configuración y validación local; MUST NOT autorizar CRUD, autorización organizacional completa, otros módulos de `initial-invoices-app` ni despliegues en TrueNAS u otros destinos.

#### Scenario: Planificación completa sin aprobación
- **WHEN** los artefactos están completos pero el usuario no ha aprobado implementar
- **THEN** no se modifica código, manifiestos, lockfiles, Dockerfiles ni entornos reales y no se instalan dependencias

#### Scenario: Ejecución futura autorizada del incremento
- **WHEN** el usuario aprueba implementar únicamente `implement-authentication`
- **THEN** se ejecutan solo sus tareas sin asumir aprobación de módulos de negocio o despliegues

### Requirement: Variables de autenticación explícitas
La documentación MUST definir el grupo frontend `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` y las variables backend `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_AUDIENCE`, `KEYCLOAK_JWKS_URL`. MUST separar configuración pública, privada y credenciales locales de bootstrap, e indicar valores host/Compose, obligatoriedad y precedencia.

#### Scenario: Configuración equivalente por modo
- **WHEN** se preparan ejemplos para host y Compose
- **THEN** ambos usan realm `invoices`, cliente `invoices-web` y audiencia `invoices-api`, con el mismo issuer público
- **AND** solo los destinos internos de servidor cambian, y ninguna variable `VITE_*` contiene secretos

### Requirement: Alcance y almacenamiento de Keycloak local
Keycloak MUST ejecutarse como servicio de desarrollo con puerto publicado en loopback, volumen persistente y versión e imagen fijadas. El modo de desarrollo HTTP MUST limitarse al entorno local; la documentación MUST exigir HTTPS fuera de ese entorno y MUST NOT presentar Compose como despliegue de producción.

#### Scenario: Parada y arranque normales
- **WHEN** se detienen y arrancan servicios sin solicitar borrado
- **THEN** se preservan los datos Keycloak y MongoDB y los puertos permanecen limitados a loopback
