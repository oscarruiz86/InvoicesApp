# Local Development

## Purpose

Permitir instalar, ejecutar y verificar las dos aplicaciones localmente de forma reproducible, con comunicación correcta entre navegador y contenedores y límites arquitectónicos comprobables.

## ADDED Requirements

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
El proyecto MUST proporcionar Dockerfiles por aplicación y Compose de desarrollo con frontend, backend y MongoDB, red compartida, versiones fijadas y recarga de código. Las dependencias del contenedor MUST permanecer separadas de las del host.

#### Scenario: Arranque completo local
- **WHEN** se ejecuta Compose con los ejemplos de entorno y puertos disponibles
- **THEN** los servicios arrancan y el navegador puede cargar la pantalla provisional y consultar la API

#### Scenario: Cambio de código en desarrollo
- **WHEN** se modifica código de la aplicación montada en el contenedor de desarrollo
- **THEN** la aplicación refleja el cambio mediante su recarga de desarrollo sin reinstalar dependencias del host

### Requirement: Direccionamiento correcto entre navegador y servicios
La configuración local MUST distinguir destinos del navegador y nombres de servicios de la red Docker. Las llamadas `/api` de la WebApp MUST alcanzar el backend tanto con aplicaciones en host como en Compose.

#### Scenario: Consulta por proxy en Compose
- **WHEN** el navegador consulta `/api/health` desde el origen del frontend en Compose
- **THEN** el servidor de frontend reenvía al backend por su nombre de servicio preservando `/api/health`
- **AND** el navegador no intenta resolver nombres internos de Docker

#### Scenario: Aplicaciones ejecutadas en el host
- **WHEN** frontend y backend se ejecutan con sus scripts locales y configuración de ejemplo
- **THEN** la misma base pública `/api` llega al backend mediante el destino de proxy configurado para el host

### Requirement: Datos locales persistentes y puertos limitados
MongoDB MUST usar un volumen persistente de desarrollo. Los puertos publicados MUST limitarse a loopback por defecto. La parada normal del entorno MUST preservar los datos y no eliminar volúmenes.

#### Scenario: Reinicio del entorno
- **WHEN** se detienen y vuelven a iniciar los servicios sin solicitar borrado de volúmenes
- **THEN** se conserva el volumen MongoDB y los puertos siguen publicados solo en las interfaces locales configuradas

### Requirement: Ejemplos de entorno y documentación operativa
El proyecto MUST incluir ejemplos sin secretos y un README con requisitos, instalación, variables públicas/privadas, ejecución en host/Compose, URLs técnicas, validación, parada y límites del alcance. MUST explicar que health no acredita disponibilidad de datos y Keycloak permanece inactivo.

#### Scenario: Ejecución siguiendo README
- **WHEN** se siguen las instrucciones en un entorno limpio con los prerrequisitos documentados
- **THEN** se puede instalar, arrancar y validar cada aplicación y el entorno conjunto sin adivinar variables o destinos de red

### Requirement: Validaciones reproducibles y separadas
Cada aplicación MUST ofrecer comprobación de tipos, lint, pruebas unitarias y arquitectura sin servicios externos. MUST existir verificación separada de MongoDB, HTTP/OpenAPI y navegador, con configuración de pruebas aislada de datos de desarrollo.

#### Scenario: Comprobación sin servicios externos
- **WHEN** se ejecuta el comando de calidad de una aplicación sin MongoDB ni Keycloak activos
- **THEN** se ejecutan tipos, lint, pruebas unitarias y arquitectura sin intentar conectar servicios externos

#### Scenario: Pruebas integradas explícitas
- **WHEN** se ejecutan las verificaciones de integración, HTTP y navegador con los servicios requeridos preparados
- **THEN** se comprueban conexión reutilizable, contrato REST, render de Swagger, layout responsive y comunicación por proxy
- **AND** se utiliza una base de pruebas distinta de la base de desarrollo

### Requirement: Aprobación previa y ausencia de despliegue
Este cambio MUST permanecer en planificación hasta aprobación explícita del usuario. Su aprobación MUST limitarse a foundations, sin autorizar los módulos funcionales de la propuesta base ni despliegues en TrueNAS u otros destinos.

#### Scenario: Planificación completa sin aprobación
- **WHEN** los artefactos del cambio están completos pero el usuario aún no ha aprobado implementarlos
- **THEN** no se generan aplicaciones, manifiestos, lockfiles, Dockerfiles ni instalaciones de dependencias

#### Scenario: Ejecución futura autorizada del incremento
- **WHEN** el usuario aprueba implementar únicamente `initialize-foundations`
- **THEN** las tareas se limitan a bases técnicas y validación local sin desplegar ni iniciar módulos de negocio
