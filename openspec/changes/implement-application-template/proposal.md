# Proposal

## Why

Invoices App ya tiene una guía de diseño y una nueva capacidad de notificaciones. Falta convertir esos acuerdos en un template React reutilizable que ofrezca una navegación coherente, estados comunes y una representación segura de las entregas de invitaciones.

## What Changes

- Implementar el shell administrativo definido en `design-application-ui`, con barra lateral adaptable, botón de menú antes del título, selector de contexto, menú de usuario y rutas de estado comunes.
- Incorporar el tema, los patrones Material UI y los componentes compartidos para listas, formularios, detalles, confirmaciones, carga, vacío, error y acceso denegado.
- Aplicar permisos y contexto confirmados por el backend al menú, las acciones y las rutas, sin sustituir los controles de autorización del servidor. El inicio mostrará los módulos del rol actual.
- Incorporar una vista administrativa de entregas de notificaciones para invitaciones, con estados `pending`, `sent` y `failed`, destinatarios enmascarados y datos técnicos saneados.
- Implementar el módulo Usuarios para consultar asociaciones por empresa, buscar por nombre o correo y por número de documento, revisar detalles de solo lectura y gestionar asociaciones según tipo de organización y rol.
- Integrar puntos de extensión para los módulos de empresas, flota, facturas, parámetros y auditoría, respetando sus contratos funcionales ya definidos.

## Capabilities

### New Capabilities

- `application-template`: shell web administrativo reutilizable, navegación autorizada, patrones de interfaz y representación segura de estados operativos.

### Modified Capabilities

Ninguna. Las reglas de negocio, los permisos y la entrega SMTP continúan bajo sus capacidades propietarias.

## Impact

La implementación afectará el frontend React, Vite, TypeScript, Material UI, React Router y Zustand. Requiere contratos de lectura para identidad, contexto, usuarios y asociaciones, además del historial técnico de entregas, sin exponer secretos SMTP, tokens de invitación, cuerpos de correo ni destinatarios completos.
