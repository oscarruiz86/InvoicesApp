## Why

Invoices App tiene una base de presentación y módulos con distintos grados de avance. Necesita un diseño común que permita revisar todas las pantallas, permisos visibles y recorridos antes de construir o ajustar las interfaces de cada módulo.

## What Changes

- Diseñar el panel administrativo elegido, con menú lateral por módulos, encabezado, contexto organizacional visible y portada con accesos permitidos.
- Definir el sistema visual, los patrones reutilizables y el inventario de pantallas de acceso, administración, flota, facturas, parámetros y auditoría.
- Preparar wireframes anotados y recorridos verificables para escritorio y móvil, incluidos estados de sesión, permisos, validación y recuperación.
- Vincular cada pantalla con su OpenSpec funcional y registrar las decisiones pendientes antes de fijar un comportamiento.

## Capabilities

### New Capabilities

- `application-ui-design`: diseño verificable de la navegación, los patrones compartidos, las pantallas por módulo y sus estados.

### Modified Capabilities

Ninguna. La entrega de diseño sirve de referencia para el futuro cambio de componentes compartidos y para las propuestas funcionales.

## Impact

El trabajo de este cambio produce documentación, wireframes y una matriz de trazabilidad. El diseño toma Shadcn Admin como referencia visual y usa el stack vigente de Invoices App como base de viabilidad: React, Vite, TypeScript, Material UI, React Router, Zustand y Keycloak.
