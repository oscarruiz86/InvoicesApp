# Organization Context Specification

## Purpose

Permitir al usuario autenticado descubrir, seleccionar, cambiar y restaurar su contexto de interacción con empresas o terceros, con validación del backend y una experiencia aislada entre organizaciones y pestañas.

## Requirements

### Requirement: Descubrimiento de destinos autorizados
El sistema MUST listar únicamente organizaciones activas con pertenencias aceptadas o migradas LEGACY activas y asignaciones funcionales activas del sujeto autenticado y al menos un permiso efectivo. MUST obtener roles locales de esas asignaciones sin exigirlos en el JWT, devolver nombre, tipo y roles aplicables, deduplicar organizaciones y excluir acceso transitivo por relaciones empresa-tercero.

#### Scenario: Organizaciones propias y ajenas
- **GIVEN** un usuario asociado a A y una organización B ajena
- **WHEN** consulta sus contextos disponibles
- **THEN** recibe A si tiene permisos efectivos y no recibe nombres, identificadores ni conteos de B

#### Scenario: Organización inactiva — caso 9
- **GIVEN** una asociación activa con organización inactiva
- **WHEN** el usuario consulta destinos o intenta resolver ese contexto
- **THEN** el destino no aparece y la resolución devuelve 403 neutro

#### Scenario: Relación entre empresa y tercero
- **GIVEN** un administrador de empresa y un tercero vinculado sin capacidad local del usuario en ese tercero
- **WHEN** consulta destinos
- **THEN** la relación no añade el tercero a sus destinos

### Requirement: Entrada con una única organización
Sin preferencia válida ni acceso GLOBAL, el sistema MUST resolver automáticamente la única organización disponible después de confirmar identidad. MUST habilitar navegación solo después de validar contexto y permisos; MUST NOT mostrar un selector innecesario.

#### Scenario: Una sola empresa — caso 1
- **GIVEN** un COMPANY_ADMIN con una única empresa autorizada
- **WHEN** completa login sin preferencia previa
- **THEN** la empresa se valida y activa automáticamente y se abre el resumen autorizado

#### Scenario: Un solo tercero — caso 3
- **GIVEN** un THIRD_PARTY_ADMIN o DRIVER con un único tercero autorizado
- **WHEN** completa login sin preferencia previa
- **THEN** el tercero se valida y activa sin pantalla de elección y solo se habilitan sus permisos aplicables

### Requirement: Elección explícita entre múltiples organizaciones
Sin preferencia válida ni acceso GLOBAL, el sistema MUST solicitar elección si existen dos o más organizaciones autorizadas. MUST NOT escoger arbitrariamente y MUST validar nuevamente la selección en backend antes de habilitarla.

#### Scenario: Varias empresas — caso 2
- **GIVEN** dos empresas autorizadas
- **WHEN** el usuario completa login
- **THEN** ve ambas con nombre y tipo y ninguna queda activa hasta su elección validada

#### Scenario: Varios terceros — caso 4
- **GIVEN** un usuario con varios terceros autorizados
- **WHEN** selecciona uno
- **THEN** el backend resuelve ese tercero y la navegación se habilita para ese ámbito

#### Scenario: Asociaciones de distintos tipos — caso 6
- **GIVEN** un usuario con una empresa y un tercero autorizados
- **WHEN** completa login sin preferencia
- **THEN** ve dos destinos distinguibles por tipo y debe elegir uno

### Requirement: Contexto vacío y excepción global explícita
Sin destinos organizacionales y sin permisos globales, el sistema MUST bloquear módulos organizacionales, mostrar un mensaje claro y permitir reintento y logout sin bucles. GLOBAL MUST estar disponible solo con permisos administrativos globales y MUST ser el destino inicial sin preferencia de esos usuarios.

#### Scenario: Sin asociaciones — caso 8
- **GIVEN** una identidad válida sin asociaciones ni permisos globales
- **WHEN** termina el descubrimiento
- **THEN** se muestra estado vacío con logout, sin entrar a módulos ni reiniciar login repetidamente

#### Scenario: Administrador global sin empresa — caso 7
- **GIVEN** APP_ADMIN con permisos globales vigentes y sin asociaciones
- **WHEN** completa login
- **THEN** accede al resumen GLOBAL y únicamente a funciones globales implementadas y autorizadas
- **AND** no recibe acceso operativo a flota o facturas ni un listado de todas las organizaciones

### Requirement: Roles locales sin ampliación por selección
Los roles y permisos mostrados MUST proceder del backend y conservar el vínculo entre rol, capacidad local y alcance. Seleccionar contexto MUST NOT crear permisos, modificar roles del proveedor ni convertir GLOBAL en autorización operativa.

#### Scenario: Múltiples roles — caso 5
- **GIVEN** COMPANY_ADMIN en A y DRIVER en B con ambos roles en el token
- **WHEN** el usuario selecciona B
- **THEN** recibe únicamente grants completos aplicables a B, sin administración de empresa por combinar roles

#### Scenario: Administrador global con rol operativo adicional
- **GIVEN** APP_ADMIN y THIRD_PARTY_ADMIN con asociación activa a T
- **WHEN** cambia de GLOBAL a T
- **THEN** la selección requiere la capacidad local y permisos de T y no aplica permisos globales como comodín

### Requirement: Resolución autenticada de contexto explícito
El backend MUST resolver el contexto a partir del sujeto del token validado, asociaciones, organizaciones y política vigentes. MUST rechazar datos de identidad/permisos suministrados por el cliente y MUST devolver 403 neutro para destinos inexistentes, ajenos o inactivos.

#### Scenario: Selección ajena — caso 11
- **GIVEN** una sesión válida sin asociación a B
- **WHEN** solicita B directamente a la API
- **THEN** recibe 403 sin datos de B y no se establece contexto listo

#### Scenario: Identificador manipulado — caso 22
- **GIVEN** un navegador cuyo estado persistido fue alterado para apuntar a otra organización
- **WHEN** intenta restaurar o resolver esa selección
- **THEN** el backend vuelve a comprobar acceso y rechaza el destino ajeno
- **AND** campos subject, roles o permissions adicionales en el cuerpo producen 400

### Requirement: Cambio durante la sesión sin reautenticación
El usuario MUST poder consultar destinos frescos y cambiar entre contextos autorizados sin volver a introducir credenciales ni modificar su token. La interfaz MUST actualizar permisos, indicador y navegación y llevarlo a una ruta válida después de resolver el destino.

#### Scenario: Cambio de empresa — caso 12
- **GIVEN** A activa y B también autorizada
- **WHEN** selecciona B desde la cabecera
- **THEN** se valida B, se muestran sus permisos e indicador y se abre una ruta válida sin nuevo login

#### Scenario: Cambio de tercero — caso 13
- **GIVEN** T1 activo y T2 autorizado
- **WHEN** selecciona T2
- **THEN** solo se muestran datos y opciones del nuevo tercero tras completar la validación

#### Scenario: Cambios consecutivos
- **GIVEN** resoluciones pendientes hacia B y después C
- **WHEN** B responde después de C
- **THEN** solo la selección más reciente puede publicar contexto y navegación

### Requirement: Transición sin datos privados anteriores
Al confirmar cambio, el sistema MUST ocultar y limpiar datos, cachés, formularios y selecciones del contexto anterior, invalidar permisos y controlar solicitudes pendientes. MUST descartar respuestas de otra sesión, contexto o generación. Un fallo MUST dejar una pantalla segura de reintento/selección sin restaurar datos anteriores automáticamente.

#### Scenario: Solicitud pendiente — caso 18
- **GIVEN** una lectura de A pendiente
- **WHEN** el usuario cambia a B y llega tarde la respuesta de A
- **THEN** la respuesta no modifica datos, permisos, formularios ni navegación de B

#### Scenario: Datos sin guardar
- **GIVEN** un formulario modificado en A
- **WHEN** el usuario solicita cambio y cancela la confirmación de descarte
- **THEN** conserva A y el formulario intactos
- **AND** si confirma, el formulario se limpia antes de publicar B

#### Scenario: Fallo al seleccionar destino
- **GIVEN** un cambio confirmado hacia B
- **WHEN** falla su validación o conexión
- **THEN** no se muestran datos privados de A ni B y se ofrece reintento o selección

#### Scenario: Escritura ya recibida por el servidor
- **GIVEN** una operación de A enviada antes del cambio
- **WHEN** el usuario activa B y la operación de A termina
- **THEN** su respuesta no se aplica ni se reintenta automáticamente en B
- **AND** el cambio de interfaz no afirma haber revertido la operación de A

### Requirement: Restauración segura por pestaña
El sistema MUST conservar selección durante navegación y restaurarla después de recargar únicamente tras revalidarla para la identidad actual. MUST persistir solo una preferencia mínima sin tokens, nombres, roles ni permisos, mantener pestañas independientes y descartar preferencias de otra identidad.

#### Scenario: Recarga — caso 14
- **GIVEN** una selección persistida de la misma identidad
- **WHEN** se recarga la página y se confirma sesión
- **THEN** se revalida antes de mostrar contenido privado y se restaura solo si sigue autorizada

#### Scenario: Pestañas con contextos distintos — caso 21
- **GIVEN** dos pestañas del mismo usuario con A y B autorizados
- **WHEN** una cambia a C
- **THEN** la otra conserva su selección y cada petición se valida con su propio contexto explícito

#### Scenario: Almacenamiento no disponible
- **GIVEN** el navegador bloquea almacenamiento de sesión
- **WHEN** el usuario selecciona un contexto
- **THEN** puede trabajar en memoria y al recargar se repite selección de forma segura sin afirmar restauración persistente

### Requirement: Limpieza por cierre y expiración
Logout o pérdida de sesión MUST borrar contexto, preferencias, permisos y datos privados, cancelar solicitudes y notificar limpieza a otras pestañas abiertas sin transmitir credenciales. Limpiar solo el contexto MUST conservar la sesión Keycloak y abrir selección sin reactivarlo inmediatamente.

#### Scenario: Cierre de sesión — caso 15
- **GIVEN** contexto activo y varias pestañas abiertas
- **WHEN** el usuario cierra sesión
- **THEN** se limpia el estado local y se comunica limpieza a las demás pestañas aunque falle el cierre remoto
- **AND** respuestas anteriores no repueblan datos

#### Scenario: Sesión expirada — caso 16
- **GIVEN** una sesión que no puede renovarse
- **WHEN** una resolución devuelve 401
- **THEN** se invalida la sesión y se ocultan datos sin bucles de login

#### Scenario: Limpiar selección explícitamente
- **GIVEN** una sesión autenticada con contexto activo
- **WHEN** el usuario limpia la selección
- **THEN** se eliminan preferencia y datos, se abre el selector y no se cierra Keycloak

### Requirement: Revocación y actualización de permisos
Cada solicitud protegida MUST revalidar pertenencias, asignaciones, estados y política sin usar el snapshot del navegador como autorización. La UI MUST revalidar al recuperar foco y al renovar o caducar permisos, con intervalo de vigencia máximo de 30 segundos. La ventana JWT de Identity & Access solo aplica a APP_ADMIN; retirar roles locales afecta la siguiente petición, sin logout ni notificaciones automáticas.

#### Scenario: Asociación desactivada — caso 10
- **GIVEN** una asociación revocada y confirmada tras seleccionar A
- **WHEN** el usuario realiza una nueva validación o petición protegida con A
- **THEN** se rechaza y la UI elimina contexto/datos al observar el rechazo

#### Scenario: Permisos cambiados durante sesión — caso 17
- **GIVEN** una política MongoDB que acaba de retirar un permiso
- **WHEN** se solicita la operación o se refresca el contexto
- **THEN** el backend aplica la política vigente y la UI retira la acción al revalidar
- **AND** si ya no queda ningún permiso efectivo, el contexto deja de estar listo

### Requirement: Contexto capturado y límites de recursos
Las solicitudes MUST capturar su contexto al iniciarse y validar la pertenencia real mediante contratos de autorización existentes. La selección MUST NOT relajar restricciones de DRIVER ni permitir reutilizar un recurso de A bajo B. Las mutaciones futuras MUST comprobar revisiones en su punto de confirmación antes de habilitarse.

#### Scenario: Recurso de organización anterior — caso 19
- **GIVEN** B activo y un ID de recurso perteneciente a A
- **WHEN** se solicita ese recurso bajo B
- **THEN** el backend rechaza con 404 neutro sin exponer ni modificar el recurso
- **AND** no basta enviar en el cuerpo un propietario B falso

#### Scenario: Conductor cambia de tercero
- **GIVEN** DRIVER autorizado en T1 y T2 y vehículo asignado únicamente en T1
- **WHEN** solicita registrar factura bajo T2 usando ese vehículo
- **THEN** la autorización y el módulo propietario rechazan por evidencia de pertenencia/asignación incompatible

#### Scenario: Revocación concurrente con mutación
- **GIVEN** una decisión previa y una revocación confirmada antes de confirmar la escritura
- **WHEN** el módulo propietario intenta confirmar con revisión obsoleta
- **THEN** no confirma la mutación
- **AND** esta aceptación requiere persistencia real del propietario y no se declara completa con dobles

### Requirement: Navegación protegida y selector accesible
El selector MUST mostrar aplicación, usuario, nombre/tipo de destinos, roles relevantes, estados de carga/error, reintento y logout. MUST funcionar por teclado y lector de pantalla en móvil/escritorio. Rutas organizacionales MUST exigir contexto validado y permiso; rutas globales MUST exigir su permiso global.

#### Scenario: Ruta directa sin contexto — caso 20
- **GIVEN** identidad válida sin contexto resuelto
- **WHEN** abre una ruta organizacional protegida directamente
- **THEN** no se renderiza contenido privado y se dirige al flujo de resolución/selección sin bucles

#### Scenario: Selector móvil y escritorio
- **GIVEN** viewport de 360 o 1280 px
- **WHEN** se utiliza el selector con teclado o lector de pantalla
- **THEN** las tarjetas y controles son legibles, no hay scroll horizontal, el foco es visible y los estados se anuncian
- **AND** los controles táctiles tienen al menos 44 px y no aparecen módulos todavía inexistentes

### Requirement: API documentada sin estado activo de servidor
La API MUST ofrecer GET /api/organization-contexts y POST /api/organization-contexts/resolve con Bearer, DTO estrictos y no-store. MUST reutilizar snapshot y errores de autorización, documentarse en OpenAPI 3.1 bajo Organization Context y no crear una sesión de contexto servidor implícita.

#### Scenario: Contrato de resolución
- **GIVEN** token válido y selección autorizada con reason INITIAL, SWITCH o RESTORE
- **WHEN** se resuelve el contexto
- **THEN** responde 200 con el contexto y snapshot vigente del propio sujeto conforme al diseño y OpenAPI
- **AND** GLOBAL carece de identificador organizacional y requiere grants globales

#### Scenario: Errores uniformes
- **GIVEN** solicitudes con JSON inválido, token inválido, destino ajeno o proveedor caído
- **WHEN** se procesan
- **THEN** devuelven respectivamente 400 INVALID_REQUEST, 401 UNAUTHENTICATED, 403 FORBIDDEN o 503 AUTHORIZATION_UNAVAILABLE con error.code y error.message neutros
- **AND** no se convierte indisponibilidad en lista vacía ni se ofrecen datos ficticios

### Requirement: Trazabilidad de resolución e invalidación
El backend MUST capturar duraderamente resoluciones exitosas antes de responder y registrar denegación/invalidación con datos mínimos sin tokens ni IDs ajenos no validados. Un cambio declarado por el navegador MUST registrarse como intención, no como prueba de contexto anterior. La revocación real MUST auditarse por su escritor propietario.

#### Scenario: Selección auditada
- **GIVEN** resolución válida
- **WHEN** se captura el evento de selección, restauración o intención de cambio
- **THEN** incluye actor verificado, organización validada si existe, acción, instante, resultado e ID de evento
- **AND** si falla captura durable no se devuelve éxito ni se publica el contexto en UI

#### Scenario: Intento ajeno e invalidación
- **GIVEN** una selección ajena o restauración que ya no es válida
- **WHEN** se rechaza
- **THEN** se registra denegación o invalidación sin divulgar organización ajena ni afirmar quién/cuándo revocó la asociación
- **AND** un fallo al registrar nunca transforma el rechazo en acceso
