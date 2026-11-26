# pwa-runtime Specification

## Purpose

Permite instalar Invoice App como una PWA móvil y recuperar un shell funcional sin conexión, conservando de forma controlada los recursos y datos locales necesarios para la captura offline.

## Requirements

### Requirement: PWA instalable y reconocible
La aplicación MUST publicar un manifiesto válido con nombre, iconos, colores, modo de presentación y rutas de inicio coherentes, y MUST registrar el service worker en producción bajo un contexto seguro.

#### Scenario: Instalación en dispositivo compatible
- **WHEN** un usuario autenticado abre la aplicación en un navegador compatible con conexión
- **THEN** el navegador puede ofrecer instalar Invoice App y al abrirla muestra la ruta de inicio dentro del mismo origen

#### Scenario: Entorno no seguro
- **WHEN** la aplicación se sirve fuera de HTTPS y no es localhost
- **THEN** la aplicación sigue funcionando como web, pero informa que la instalación y algunas capacidades offline requieren un contexto seguro

### Requirement: Shell navegable sin conexión
El service worker MUST precargar y actualizar los recursos estáticos necesarios para iniciar la aplicación y MUST devolver una respuesta local para la navegación cuando no haya red, sin interceptar ni falsificar solicitudes `/api/`.

#### Scenario: Reapertura sin red
- **WHEN** un usuario abre la PWA instalada sin conexión después de una visita exitosa
- **THEN** se carga el shell almacenado y la aplicación puede decidir entre la captura offline disponible o un mensaje de conexión requerida

#### Scenario: Actualización del shell
- **WHEN** existe una versión nueva del shell
- **THEN** el service worker instala la versión nueva sin borrar la versión activa hasta completar la instalación y la aplicación comunica cuándo puede actualizarse

### Requirement: Persistencia local protegida
La aplicación MUST guardar la cola offline, credenciales limitadas, asignaciones y metadatos de preparación en almacenamiento aislado por sujeto y tercero, solicitar persistencia cuando el navegador lo permita y reportar si el almacenamiento no está disponible o puede ser desalojado.

#### Scenario: Persistencia concedida
- **WHEN** el navegador concede almacenamiento persistente durante una sesión autenticada
- **THEN** la aplicación marca la preparación local como protegida y continúa sin pedir al conductor que visite Facturas

#### Scenario: Cuota o almacenamiento no disponible
- **WHEN** una escritura local falla o el navegador no concede persistencia
- **THEN** la aplicación conserva los datos que pueda, marca la preparación como degradada y muestra una instrucción para liberar espacio o volver a conectarse

### Requirement: Señalización de conectividad y preparación
La PWA MUST mostrar un estado global de conexión y preparación offline sin bloquear la navegación, distinguir listo, preparando, no disponible y credencial vencida, y limitar los avisos de captura a usuarios DRIVER.

#### Scenario: Preparación en segundo plano
- **WHEN** termina el inicio de sesión y existe un contexto DRIVER válido
- **THEN** la aplicación inicia la preparación offline en segundo plano y permite usar el resto de módulos mientras informa su estado

#### Scenario: Rol sin captura offline
- **WHEN** un usuario que no es DRIVER inicia sesión
- **THEN** no se emiten solicitudes de credencial offline ni se muestran controles de captura offline

### Requirement: Sincronización progresiva al reactivarse
La aplicación MUST intentar sincronizar la cola al recuperar conexión, al recibir foco o al abrirse de nuevo, usando la sesión autenticada normal; Background Sync solo podrá registrarse como mejora progresiva cuando exista soporte y no podrá depender de tokens persistidos.

#### Scenario: Navegador con Background Sync
- **WHEN** se guarda una captura pendiente y el navegador expone `registration.sync`
- **THEN** la aplicación registra una tarea de sincronización y conserva el reintento normal al recuperar foco o conexión

#### Scenario: Navegador sin Background Sync
- **WHEN** el navegador no expone Background Sync
- **THEN** la aplicación no falla ni promete envío con la app cerrada y sincroniza al volver a abrirse, recuperar conexión o recibir foco

### Requirement: Seguridad del ciclo de vida PWA
La PWA MUST eliminar o aislar datos locales al cerrar sesión, cambiar de sujeto o cambiar de tercero, MUST validar la credencial firmada antes de habilitar captura y MUST impedir que el service worker use la credencial offline para autenticar llamadas de API.

#### Scenario: Cierre de sesión con cola pendiente
- **WHEN** el conductor cierra sesión con registros sin resultado definitivo
- **THEN** la aplicación aplica la política de advertencia y limpieza existente, y la PWA no deja visibles datos del sujeto anterior

#### Scenario: Solicitud de API desde service worker
- **WHEN** el service worker intenta procesar una sincronización
- **THEN** no encuentra tokens de sesión persistidos y delega el envío a una sesión normal disponible o deja el registro pendiente
