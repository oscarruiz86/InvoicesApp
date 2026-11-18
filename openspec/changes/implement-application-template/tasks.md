# Tasks

## 1. Base del template y contratos de presentación

- [x] 1.1 Integrar el template con la aplicación existente React, Vite, TypeScript, Material UI, React Router y Zustand, y verificar la compilación de producción.
- [ ] 1.2 Definir los puertos y DTOs de presentación para sesión, permisos, contexto, usuarios, asociaciones y entregas de notificaciones, y verificar que no importan modelos de dominio ni secretos de infraestructura.
- [ ] 1.3 Implementar el registro de rutas y navegación declarativa por módulo, permiso y contexto, y verificar que una sesión de prueba ve solo las rutas autorizadas.

## 2. Shell, navegación y estados comunes

- [x] 2.1 Implementar el tema Material UI y los tokens aprobados para color, espaciado, tipografía, foco y estados, y verificar contraste, foco visible y navegación con teclado en los controles compartidos.
- [x] 2.2 Implementar `AppShell` con botón de menú antes del título, barra lateral plegable, menú móvil y avatar de usuario, y verificar las rutas disponibles a 360 px y 1280 px sin desplazamiento horizontal.
- [x] 2.3 Implementar el selector de contexto con espera, confirmación, rechazo e invalidación de datos de página, y verificar que un cambio exitoso recarga el contexto y un rechazo no muestra datos anteriores como actuales.
- [ ] 2.4 Implementar vistas de carga de sesión, autenticación fallida, sesión expirada, contexto ausente, 403 y 404, y verificar que cada navegación mueve el foco al título y no expone datos protegidos.

## 3. Patrones reutilizables de módulo

- [x] 3.1 Implementar los componentes de listado con búsqueda, filtros, paginación, carga, vacío, error y reintento no bloqueante, y verificar el estado de recuperación con una fuente de datos de prueba que falle y se recupere sin ocultar contenido seguro. Para empresas, incluir búsqueda por NIT, razón social o nombre comercial y filtros de estado, tipo de documento, país, departamento y ciudad.
- [x] 3.2 Implementar formularios, detalles, resumen de validación y confirmaciones, y verificar que se conservan valores seguros y se muestran errores de campo y del servidor.
- [ ] 3.3 Integrar rutas de marcador para empresas, flota, facturas, parámetros, roles y auditoría usando los patrones comunes, y verificar que los módulos pueden registrar una pantalla sin acoplarse al shell.
- [ ] 3.4 Implementar el módulo Usuarios con selección obligatoria de empresa, selector precargado y ordenado por razón social, lista de asociaciones y un solo campo para buscar por nombre/correo/documento; conservar los nombres disponibles de usuarios suspendidos y cerrar avisos de éxito automáticamente. Evitar repetir el nombre de Empresa en Organización; permitir Tipo de organización Todos con asociaciones directas y de terceros de la empresa. Añadir ordenamiento por columnas y paginación. Verificar chips removibles, filtros en cascada y columnas sin correo.
- [ ] 3.5 Implementar la asociación por empresa con el buscador existente de empresas por nombre/NIT, tipo Empresa/Tercero y selector modal de terceros limitado a la empresa; no incluir búsquedas separadas de usuario/documento en el formulario, que recibe el correo para la invitación. Autocompletar coincidencias de usuarios al escribir correo. Verificar que Tercero solo aparece para ese tipo y que rol/opciones dependen del destino.
- [ ] 3.6 Implementar el detalle de usuario en solo lectura con tipo y número de documento, correo, empresa, organización, rol y estado; verificar que no se ofrece editar perfil.
- [ ] 3.7 Implementar suspensión de una asociación con confirmación explícita y opciones Aceptar/Cancelar; verificar que Cancelar no envía cambios.
- [ ] 3.8 Implementar acciones de editar y desactivar en listados autorizados de empresa, conductor y vehículo, y verificar que cada acción abre el flujo correspondiente.

## 4. Entregas de notificaciones

- [ ] 4.1 Implementar la ruta de lectura de entregas de notificaciones con registro condicionado por permiso, y verificar que una sesión sin permiso no obtiene acceso a la ruta ni a su navegación.
- [ ] 4.2 Implementar listado y detalle de entrega con tipo, canal, fecha, estado, intentos, próximo intento, destinatario enmascarado y resultado saneado, y verificar que `pending`, `sent` y `failed` son distinguibles.
- [ ] 4.3 Agregar pruebas de presentación que rechacen DTOs con cuerpos de correo, tokens, claves de idempotencia, secretos SMTP o credenciales, y verificar que no se renderiza ninguno de esos valores.

## 5. Verificación integrada

- [ ] 5.1 Ejecutar compilación, pruebas de componentes y recorridos de escritorio y móvil para los cuatro roles definidos, y registrar la evidencia de permisos, foco, cambio de contexto y estados de página.
- [ ] 5.2 Actualizar la guía de integración del template con los contratos de registro de módulos, Usuarios y entregas de notificaciones, y verificar que los ejemplos no requieren datos sensibles.

## Workflow follow-up

- Revisar el cambio antes de archivarlo y sincronizar las especificaciones cuando corresponda.
