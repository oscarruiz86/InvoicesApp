# Registro de implementación de foundations

## Autorización y alcance

El usuario autorizó ejecutar `initialize-foundations` al invocar explícitamente `$openspec-apply-change initialize-foundations` después de presentar y revisar sus artefactos de planificación.

La autorización cubre exclusivamente las bases técnicas de frontend, backend, pruebas y desarrollo local descritas en ese cambio. No autoriza implementar capacidades de negocio, login ni desplegar en TrueNAS u otro destino.

## Correspondencia con la propuesta base

Este incremento aporta evidencia parcial para las tareas 3.1–3.5 de `initial-invoices-app`: aplicaciones independientes, límites de dependencias y contratos técnicos iniciales. Las tareas de esa propuesta permanecen sin cambios; no se consideran completadas por ejecutar este incremento. Las decisiones funcionales P1–P7 no se resuelven implícitamente.

## Entorno observado

- Node.js: 24.15.0.
- npm: 11.12.1.
- Docker CLI: 29.5.3; el motor Linux no estaba disponible en la comprobación inicial.
- Se inició Docker Desktop y se confirmó su motor Linux 29.5.3 antes de ejecutar pruebas o compilaciones de contenedores.
- No se ha realizado ningún despliegue.

Las versiones de paquetes e imágenes y las verificaciones efectivamente realizadas se registrarán antes de dar por completadas las tareas correspondientes. Una tarea con verificaciones pendientes no se marcará como terminada.

## Configuración local

El puerto 27017 estaba ocupado por un servicio previo. Se seleccionó 27019, disponible, para la publicación MongoDB de este proyecto en `.env` y para la URI del backend en `backend/.env.local`. Los ejemplos mantienen el valor convencional editable. No se detuvo ni modificó el servicio que utiliza 27017. Frontend y API conservan 5173 y 3000.

La prueba real de HMR no recibió eventos del disco Windows en el bind mount. Se aplicó el ajuste previsto por el diseño: polling Vite y Next/Webpack con Watchpack en Compose. La configuración host mantiene su modo normal. Los archivos modificados temporalmente durante las pruebas de recarga se restauran siempre en un bloque finally.
