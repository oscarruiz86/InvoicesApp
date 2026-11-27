# Spec Delta

## Purpose

Establece una forma consistente de seleccionar, ejecutar y comunicar las verificaciones de calidad de Invoices App durante entregas incrementales, usando herramientas existentes y evidencia reproducible.

## ADDED Requirements

### Requirement: Niveles de verificación distinguibles
La documentación del proyecto MUST distinguir checks rápidos de aplicación, pruebas de integración con servicios, y aceptación HTTP/OpenAPI/build/E2E. MUST describir qué valida cada comando existente y qué capas deja fuera, sin presentar un nivel como evidencia de otro.

#### Scenario: Cambio validado solo con check local
- **WHEN** un cambio ejecuta únicamente `check` de backend o frontend
- **THEN** el informe identifica lint, TypeScript, pruebas unitarias y arquitectura como cubiertos
- **AND** no afirma que se ejecutaron integración, HTTP, OpenAPI, build o E2E

#### Scenario: Cambio requiere servicio real o contrato
- **WHEN** la capacidad depende de MongoDB transaccional, Route Handlers, OpenAPI o un flujo de navegador
- **THEN** la selección de verificaciones incluye la suite focal de esa capa o registra claramente por qué no pudo ejecutarse

### Requirement: Selección trazable por alcance
Cada cambio implementado MUST relacionar las capacidades y riesgos modificados con las suites pertinentes, incluidos errores y límites arquitectónicos cuando correspondan. La selección MUST reutilizar comandos y harnesses existentes antes de proponer herramientas nuevas.

#### Scenario: Cambio transversal
- **WHEN** un cambio modifica más de una aplicación o una integración entre módulos
- **THEN** su plan de verificación cubre las aplicaciones afectadas y al menos el contrato de integración que conecta sus responsabilidades

#### Scenario: Suite no aplicable
- **WHEN** una suite no corresponde al alcance o no puede ejecutarse por una dependencia externa ausente
- **THEN** se registra como no ejecutada con su motivo y no se presenta como aprobada

### Requirement: Aislamiento de pruebas con efectos persistentes
Las verificaciones que usan MongoDB, Keycloak, workers, archivos o contenedores MUST operar sobre recursos de prueba identificables y aislados. La limpieza MUST limitarse a los recursos creados por la propia ejecución y MUST NOT borrar ni mutar datos locales u operativos.

#### Scenario: Integración con MongoDB
- **WHEN** una suite escribe datos persistentes o prueba transacciones
- **THEN** usa una base aislada de prueba con sufijo `_test` y una topología compatible, y solo limpia esa base creada para la suite

#### Scenario: Proveedor o proceso externo
- **WHEN** una prueba requiere Keycloak, navegador, worker o contenedor
- **THEN** usa una fixture descartable o configuración temporal y retira solo los recursos que creó al finalizar

### Requirement: Evidencia reproducible y honesta
El registro de verificación MUST incluir comandos exactos, entorno requerido, resultados observados, omisiones/fallos y límites relevantes. La evidencia histórica MUST permanecer distinguible de la verificación del cambio actual.

#### Scenario: Verificación final registrada
- **WHEN** termina la verificación de un cambio
- **THEN** `docs/verification.md` diferencia resultados actuales de registros históricos y conserva fallos, advertencias u omisiones sin presentarlos como éxitos

#### Scenario: Umbral o pipeline no definido
- **WHEN** no existe umbral de cobertura o proveedor/política CI aprobado
- **THEN** la propuesta de verificación no inventa porcentajes ni gates obligatorios
