# Spec Delta

## MODIFIED Requirements

### Requirement: Matriz inicial de operaciones permitidas
El sistema MUST aplicar las concesiones y restricciones de la tabla del escenario siguiente. Toda celda pendiente o no indicada MUST denegarse. CRUD de maestros MUST significar crear, leer, actualizar y desactivar, nunca borrado físico. Una concesión organizacional MUST exigir el vínculo funcional del rol para ese ámbito.

#### Scenario: Evaluación de cada celda de la matriz
- **GIVEN** una identidad válida y todas las condiciones de alcance y recurso cumplidas
- **WHEN** se evalúa cada combinación de la tabla
- **THEN** solo las concesiones explícitas siguientes permiten continuar; P significa pendiente y denegado, — significa denegado

| Permisos | APP_ADMIN | COMPANY_ADMIN | THIRD_PARTY_ADMIN | DRIVER |
| --- | --- | --- | --- | --- |
| companies:create/read/update/deactivate | Todos, global administrativo | read/update asociados | — | — |
| third-parties:create/read/update/deactivate | P | Todos vinculados a sus empresas | read/update asociados | — |
| users:create/read/update/associate | Todos, administrativo global | create/read/associate de administradores de tercero autorizados; update P | P | read propio; update P |
| drivers:create/read/update/deactivate | P | P | Todos del tercero autorizado | read propio; demás — |
| vehicles:create/read/update/deactivate | P | P | Todos del tercero autorizado | read activos asignados; demás — |
| vehicles:assign/unassign | P | P | Ambos del tercero autorizado | — |
| assignments:read | P | P | Del tercero autorizado | Propias activas |
| invoices:create/read/update/delete | P | P | read/update del contexto; create/delete P | create/read/update restringidos; delete P |
| parameters:read/update | Ambos globales | — | — | — |
| parameters:create/deactivate | P | — | — | — |
| roles:read/manage | Ambos globales dentro del catálogo autorizado | — | — | — |
| associations:read/manage | Ambos administrativos globales | Ambos para sus relaciones empresa-tercero y administradores de tercero | P | — |
| audit:read | Solo lectura global | — | — | — |

#### Scenario: Consulta de auditoría con ámbito explícito
- **GIVEN** APP_ADMIN con `audit:read`
- **WHEN** consulta con ámbito GLOBAL
- **THEN** se permite únicamente la consulta de eventos definida por la capacidad Audit
- **AND** el permiso no concede escritura ni privilegios sobre recursos operativos

#### Scenario: Consulta de auditoría por rol organizacional
- **GIVEN** COMPANY_ADMIN, THIRD_PARTY_ADMIN o DRIVER con identidad válida
- **WHEN** intenta consultar eventos de Audit
- **THEN** recibe denegación porque no tiene `audit:read`
