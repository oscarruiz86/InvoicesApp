# Operación PWA y captura offline

## Publicación

Sirve `frontend/dist` bajo HTTPS (localhost es la única excepción para desarrollo). El manifiesto y los iconos se publican desde la raíz. Tras desplegar una versión nueva, conserva el `sw.js` versionado y permite que el aviso de actualización active el nuevo shell; para una reversión publica de nuevo el artefacto anterior y cambia la versión del cache.

## Instalación móvil

- **Android/Chrome:** abre la URL HTTPS, inicia sesión y selecciona “Instalar aplicación” o “Añadir a pantalla de inicio”.
- **iOS/Safari:** abre la URL HTTPS, pulsa Compartir y selecciona “Añadir a pantalla de inicio”.
- La captura se prepara después del login del rol DRIVER y de seleccionar un tercero. El estado indica si la credencial está lista, vencida o degradada.

La cola y la credencial limitada se guardan en IndexedDB por sujeto y tercero. El navegador puede negar almacenamiento persistente o desalojar datos: libera espacio y vuelve a conectarte antes de capturar registros críticos.

## Sincronización y límites

La aplicación reintenta al abrirse, al recuperar `online` y al recibir foco. Background Sync se registra solo cuando el navegador lo ofrece y no contiene tokens. iOS y Firefox pueden no ejecutar tareas con la aplicación cerrada; la interfaz no promete ese comportamiento. El envío siempre requiere la sesión normal.

## Recuperación

Una credencial vencida bloquea nuevas capturas offline y conserva los pendientes para consulta. Con conexión, inicia sesión y permite que la cola reintente. Al cerrar sesión o cambiar sujeto/tercero se limpia el contexto local según la confirmación mostrada.

## Verificación en preview

```powershell
npm --prefix frontend run build
npm --prefix frontend run start
```

Prueba la URL HTTPS del proxy en Android Chrome y Safari iOS, recarga sin red y confirma que la navegación carga el shell. Las solicitudes `/api/` no se guardan en el service worker.
