# Spec Delta

## REMOVED Requirements

### Requirement: Capture administrative events only in development
The development Keycloak realm MUST record administrative events without resource representations, and production deployment configuration MUST NOT enable this capture through this change.

#### Scenario: Local realm records admin activity
- **WHEN** the imported local/development realm is initialized
- **THEN** its administrative event capture is enabled and event details are disabled

#### Scenario: Production configuration remains unchanged
- **WHEN** the production deployment configuration is inspected
- **THEN** it does not enable administrative event capture or start the development collector

**Reason**: Identity & Access requires verifiable records for administrative changes made directly in Keycloak, including production role changes.

**Migration**: Replace the development-only rule with environment-specific administrative capture that keeps event details disabled and the production collector opt-in until production runtime configuration is supplied.

## ADDED Requirements

### Requirement: Capture administrative events in configured environments
Development and configured production Keycloak realms MUST record administrative events without representations. Production capture MUST use an explicit production runtime configuration and MUST NOT enable user-event capture.

#### Scenario: Development realm capture
- **WHEN** the imported local/development realm is initialized
- **THEN** administrative events are captured without event details

#### Scenario: Production runtime is configured
- **WHEN** the production Keycloak runtime and audit collector are explicitly configured
- **THEN** administrative events are captured without representations and the collector can deliver normalized records to Audit
- **AND** user-event capture remains disabled by this capability

#### Scenario: Production runtime is absent or incomplete
- **WHEN** no production Keycloak runtime exists or required collector configuration is incomplete
- **THEN** the production collector does not start and no local-development setting is treated as production configuration

#### Scenario: Event detail contains a resource representation
- **WHEN** Keycloak receives an administrative action that would otherwise include a resource representation
- **THEN** the representation is not captured or forwarded to Audit
