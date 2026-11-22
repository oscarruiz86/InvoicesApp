# Identity & Access

## MODIFIED Requirements

### Requirement: Roles generales sin autorización organizacional implícita
El realm MUST definir `APP_ADMIN`, `COMPANY_ADMIN`, `THIRD_PARTY_ADMIN` y `DRIVER`. El backend MUST obtener los roles solo de identidad verificada y evaluar cada operación protegida junto con el permiso requerido, una asociación organizacional activa, el contexto autorizado y el propietario del recurso. Un rol, permiso o contexto declarado por el cliente MUST NOT sustituir esas comprobaciones ni conceder acceso transitivo entre empresa y tercero.

#### Scenario: Rol suficiente sin asociación válida
- **WHEN** un actor presenta el rol general requerido, pero no tiene asociación activa con la organización propietaria del recurso
- **THEN** el backend deniega la operación sin leer ni modificar el recurso

#### Scenario: Contexto o permiso manipulado
- **WHEN** el cliente declara un permiso o selecciona un contexto sin asociación válida
- **THEN** el backend vuelve a resolver actor, asociación y ámbito desde fuentes confiables y deniega la operación

#### Scenario: Roles manipulados o desconocidos
- **WHEN** el cliente envía roles en headers, query o cuerpo, o la identidad contiene roles no reconocidos
- **THEN** esos valores no conceden permisos ni acceso organizacional

#### Scenario: Política de roles preparada
- **WHEN** una operación protegida de prueba exige un rol que no tiene el actor verificado
- **THEN** la política deniega con una categoría de autorización traducible a 403, sin crear endpoints de negocio
- **AND** `/api/auth/me` continúa disponible para cualquier actor autenticado
