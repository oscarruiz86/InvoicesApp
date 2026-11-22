# Proposal

## Why

Authorization and organization changes already capture audit facts, but they do not share a durable destination or a recovery path. A common append-only contract with a two-year retention period is needed before authorization can claim complete audit delivery.

## What Changes

- Introduce a backend Audit contract for normalized, sanitized security and organization events.
- Persist accepted events idempotently and immutably, retaining them for two years.
- Deliver versioned authorization policy events from their durable capture to Audit with restart-safe retry.
- Route organization association changes through the same contract while preserving their transaction guarantee.
- Keep audit history private; this change does not add a query endpoint or enable `audit:read`.

## Capabilities

### New Capabilities
- `audit`: durable event ingestion, idempotent storage, two-year retention, and recoverable delivery.

### Modified Capabilities
- None.

## Impact

Adds a backend Audit module, MongoDB adapter/index lifecycle, a retryable outbox worker and integration tests. Identity & Access and Organizations will depend on the public Audit contract, not its storage model. Keycloak event ingestion is delivered by the separate `capture-keycloak-admin-events` change.
