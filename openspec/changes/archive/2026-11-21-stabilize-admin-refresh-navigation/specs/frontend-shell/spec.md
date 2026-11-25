# Spec Delta

## ADDED Requirements

### Requirement: La autenticación conserva la ruta protegida actual

Cuando una ruta protegida requiere autenticación, el sistema MUST conservar su ruta relativa, query y fragmento por la duración del callback OIDC y MUST volver a esa ubicación después del inicio de sesión. El destino MUST ser de mismo origen y MUST NOT ser el callback de autenticación.

#### Scenario: Retorno a una ruta protegida
- **WHEN** una persona recarga `/parameters?page=2#history` sin sesión y completa el inicio de sesión
- **THEN** vuelve a `/parameters?page=2#history`

#### Scenario: Destino no confiable
- **WHEN** el destino guardado es externo, malformado o apunta al callback OIDC
- **THEN** la aplicación usa `/session` como destino seguro
