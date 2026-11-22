# Spec Delta

## Purpose

The Audit capability preserves sanitized security and organization facts in a durable, append-only journal. It gives event producers a recoverable delivery contract while retaining records for the approved two-year period.

## ADDED Requirements

### Requirement: Producers submit normalized audit facts
Backend producers MUST submit an event with a stable event ID, server occurrence time, verified actor or service identity, action, result, correlation ID, and only validated context and resource facts. Audit MUST reject malformed events and MUST NOT accept tokens, credentials, complete claims, or arbitrary request payloads.

#### Scenario: Accept a safe event
- **WHEN** a producer submits a well-formed event with a stable ID and sanitized facts
- **THEN** Audit accepts the event for durable storage

#### Scenario: Reject sensitive event content
- **WHEN** a producer submits credentials, a token, complete claims, or arbitrary payload data
- **THEN** Audit rejects or strips that content before persistence

### Requirement: Audit storage is append-only and idempotent
Audit MUST retain the first accepted representation of an event ID and MUST NOT overwrite or duplicate it when delivery is retried. A duplicate ID with different content MUST be treated as an integrity conflict.

#### Scenario: Retry after an uncertain response
- **WHEN** a producer retries an event after it cannot determine whether the first write succeeded
- **THEN** Audit reports the original event as accepted without creating a second record

#### Scenario: Conflicting reuse of an event ID
- **WHEN** a producer submits the same event ID with different normalized facts
- **THEN** Audit rejects the conflicting event and preserves the original record

### Requirement: Audit records follow two-year retention
Audit MUST retain each accepted record for two years from its server occurrence time and MUST automatically expire it after that retention period. Expiration processing MAY lag the exact boundary but MUST NOT delete a record early.

#### Scenario: Record reaches its retention boundary
- **WHEN** an audit record is younger than two years
- **THEN** it remains stored
- **AND** once it reaches two years it becomes eligible for automatic expiration

### Requirement: Durable captures are delivered and recovered
Producers that commit an operation with deferred audit delivery MUST durably capture the event before reporting success. A delivery process MUST retry captured events until Audit accepts them and MUST acknowledge only the matching event ID after acceptance.

#### Scenario: Recovery after a worker interruption
- **WHEN** delivery stops after Audit accepted an event but before the producer acknowledged it
- **THEN** a restarted worker retries the same event ID and completes acknowledgement without creating a duplicate

#### Scenario: Audit temporarily unavailable
- **WHEN** Audit cannot accept a captured event
- **THEN** the producer retains the durable capture for a later retry
- **AND** the event is not silently discarded

### Requirement: Audit history remains private
Audit MUST NOT expose a history endpoint or grant access based only on the presence of a stored event. Reading audit history remains unavailable until a separate authorization and access policy is approved.

#### Scenario: Unapproved history query
- **WHEN** an actor attempts to read audit history through the application
- **THEN** no audit-history endpoint or data is exposed
