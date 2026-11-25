# Spec Delta

## Purpose

Capture Keycloak administrative activity in local development and deliver sanitized, idempotent facts to the shared Audit journal. Keep the collection behavior disabled in production configuration.

## ADDED Requirements

### Requirement: Capture administrative events only in development
The development Keycloak realm MUST record administrative events without resource representations, and production deployment configuration MUST NOT enable this capture through this change.

#### Scenario: Local realm records admin activity
- **WHEN** the imported local/development realm is initialized
- **THEN** its administrative event capture is enabled and event details are disabled

#### Scenario: Production configuration remains unchanged
- **WHEN** the production deployment configuration is inspected
- **THEN** it does not enable administrative event capture or start the development collector

### Requirement: Read administrative events with least privilege
The collector MUST use a dedicated service account that can view administrative events and MUST NOT receive realm-management write permissions.

#### Scenario: Collector reads events
- **WHEN** the collector authenticates with its configured service account
- **THEN** it can read the realm administrative event feed

#### Scenario: Collector cannot administer the realm
- **WHEN** the collector service account is inspected
- **THEN** its realm-management assignments contain event-view permission only

### Requirement: Normalize only approved event facts
The collector MUST map stable provider event identity, timestamp, operation, resource category, and verified actor into the shared Audit contract while excluding representations, arbitrary details, credentials, tokens, and IP addresses.

#### Scenario: Safe administrative event is normalized
- **WHEN** a valid Keycloak administrative event is received
- **THEN** Audit receives a stable idempotency key and only the approved normalized fields

#### Scenario: Provider payload contains sensitive details
- **WHEN** an event contains a representation or arbitrary detail values
- **THEN** those values are not included in the Audit record

#### Scenario: Provider event is incomplete
- **WHEN** an event lacks required identity or timestamp fields
- **THEN** the collector fails the current polling window and does not advance its durable cursor

### Requirement: Deliver events with restart-safe polling
The collector MUST use bounded, ordered time-window pagination and MUST advance its durable cursor only after every event in the window is accepted by Audit. Retried events MUST retain the provider-derived event identity.

#### Scenario: Collector restarts during delivery
- **WHEN** delivery stops before a window is acknowledged and the collector restarts
- **THEN** it re-reads the window and resubmits events with their original idempotency keys

#### Scenario: Audit writer is unavailable
- **WHEN** an event cannot be accepted by Audit
- **THEN** the cursor remains unchanged and the event is eligible for retry

#### Scenario: Window contains more events than one page
- **WHEN** the provider returns a full page of events
- **THEN** the collector requests subsequent bounded pages before acknowledging the window
